// Platform transport only. MMDB parsing and application policy remain in MoonBit.
#include <moonbit.h>
#include <stdio.h>
#include <stdlib.h>
#include <stdint.h>
#include <string.h>
#include <errno.h>
#include <sys/stat.h>
#ifdef _WIN32
#include <windows.h>
#include <io.h>
#include <fcntl.h>
#define STAT _stat64
#define FSTAT _fstat64
#define FILENO _fileno
#else
#include <unistd.h>
#include <fcntl.h>
#include <signal.h>
#define STAT stat
#define FSTAT fstat
#define FILENO fileno
#endif
static int io_error;
static FILE *input;
static int input_owned;
static int64_t input_total;
static unsigned char *line_buffer;
static int line_capacity;
int32_t mm_cli_error(void) { return io_error; }
void mm_cli_init(void) {
#ifdef _WIN32
  _setmode(_fileno(stdin), _O_BINARY);
  _setmode(_fileno(stdout), _O_BINARY);
  _setmode(_fileno(stderr), _O_BINARY);
#else
  signal(SIGPIPE, SIG_IGN);
#endif
}
#ifdef _WIN32
static wchar_t *wide_path(const char *path) {
  int n=MultiByteToWideChar(CP_UTF8,MB_ERR_INVALID_CHARS,path,-1,NULL,0);
  wchar_t *p=n ? malloc((size_t)n*sizeof(wchar_t)):NULL;
  if(p && !MultiByteToWideChar(CP_UTF8,MB_ERR_INVALID_CHARS,path,-1,p,n)){free(p);return NULL;}
  return p;
}
#endif
static FILE *open_file(const char *path) {
#ifdef _WIN32
  wchar_t *p=wide_path(path);FILE *f=p?_wfopen(p,L"rb"):NULL;free(p);return f;
#else
  // Opening a FIFO for reading must not block before the regular-file check.
  int fd=open(path,O_RDONLY|O_NONBLOCK|O_CLOEXEC);
  if(fd<0)return NULL;
  FILE *file=fdopen(fd,"rb");
  if(!file)close(fd);
  return file;
#endif
}
static int64_t regular_size(FILE *f) {
  struct STAT st;
  if(FSTAT(FILENO(f),&st))return -1;
#ifdef _WIN32
  if((st.st_mode&_S_IFMT)!=_S_IFREG)return -1;
#else
  if(!S_ISREG(st.st_mode))return -1;
#endif
  return st.st_size;
}
moonbit_string_t mm_cli_arg(int32_t index,moonbit_string_t fallback) {
#ifdef _WIN32
  typedef LPWSTR *(WINAPI *ArgvFn)(LPCWSTR,int *);
  HMODULE lib=LoadLibraryW(L"shell32.dll");
  ArgvFn fn=lib?(ArgvFn)GetProcAddress(lib,"CommandLineToArgvW"):NULL;
  int count=0;LPWSTR *args=fn?fn(GetCommandLineW(),&count):NULL;
  if(args && index>=0 && index<count){
    int size=(int)wcslen(args[index]);moonbit_string_t result=moonbit_make_string_raw(size);
    memcpy(result,args[index],(size_t)size*sizeof(wchar_t));LocalFree(args);FreeLibrary(lib);return result;
  }
  if(args)LocalFree(args);if(lib)FreeLibrary(lib);
#endif
  moonbit_incref(fallback);return fallback;
}
moonbit_bytes_t mm_cli_resolve(moonbit_bytes_t config,moonbit_bytes_t database) {
  io_error=0;char *joined=NULL;
#ifdef _WIN32
  wchar_t *c=wide_path((char*)config),*d=wide_path((char*)database);
  wchar_t *full=c?_wfullpath(NULL,c,0):NULL;free(c);
  if(full && d){
    wchar_t *a=wcsrchr(full,L'\\'),*b=wcsrchr(full,L'/');wchar_t *last=a;if(b && (!last || b>last))last=b;
    if(last)last[1]=0;
    size_t cap=wcslen(full)+wcslen(d)+4;
    wchar_t *candidate=malloc(cap*sizeof(wchar_t));
    if(candidate){
      if(wcslen(d)>1 && d[1]==L':')wcscpy(candidate,d);
      else if(d[0]==L'\\' && d[1]==L'\\')wcscpy(candidate,d);
      else if(d[0]==L'/' || d[0]==L'\\') {wcsncpy(candidate,full,2);candidate[2]=0;wcscat(candidate,d);}
      else {wcscpy(candidate,full);wcscat(candidate,d);}
      wchar_t *resolved=_wfullpath(NULL,candidate,0);free(candidate);
      if(resolved){int n=WideCharToMultiByte(CP_UTF8,WC_ERR_INVALID_CHARS,resolved,-1,NULL,0,NULL,NULL);joined=n?malloc(n):NULL;if(joined)WideCharToMultiByte(CP_UTF8,WC_ERR_INVALID_CHARS,resolved,-1,joined,n,NULL,NULL);free(resolved);}
    }
  }
  free(full);free(d);
#else
  char *cwd=getcwd(NULL,0);char *full=NULL;
  if(cwd){size_t n=strlen(cwd)+strlen((char*)config)+2;full=malloc(n);if(full){if(config[0]=='/')strcpy(full,(char*)config);else{strcpy(full,cwd);strcat(full,"/");strcat(full,(char*)config);}}free(cwd);}
  if(full){char *last=strrchr(full,'/');if(last)last[1]=0;size_t n=strlen(full)+strlen((char*)database)+1;joined=malloc(n);if(joined){if(database[0]=='/')strcpy(joined,(char*)database);else{strcpy(joined,full);strcat(joined,(char*)database);}}free(full);}
#endif
  if(!joined){io_error=1;return moonbit_make_bytes(0,0);}
  int n=(int)strlen(joined);moonbit_bytes_t out=moonbit_make_bytes(n,0);memcpy(out,joined,n);free(joined);return out;
}
moonbit_bytes_t mm_cli_read(moonbit_bytes_t path,int32_t limit) {
  io_error=0;FILE *f=open_file((char*)path);
  if(!f){io_error=1;return moonbit_make_bytes(0,0);}
  int64_t size=regular_size(f);
  if(size<0 || size>limit){io_error=2;fclose(f);return moonbit_make_bytes(0,0);}
  moonbit_bytes_t out=moonbit_make_bytes((int32_t)size,0);
  if(fread(out,1,(size_t)size,f)!=(size_t)size || fgetc(f)!=EOF || ferror(f)){io_error=1;moonbit_decref(out);out=moonbit_make_bytes(0,0);}
  if(fclose(f))io_error=1;
  return out;
}
void mm_cli_close(void) {
  if(input_owned && input)fclose(input);
  input=NULL;input_owned=0;free(line_buffer);line_buffer=NULL;line_capacity=0;
}
void mm_cli_open(moonbit_bytes_t path,int32_t max_bytes,int32_t max_line) {
  mm_cli_close();io_error=0;input_total=0;
  input_owned=strcmp((char*)path,"-")!=0;input=input_owned?open_file((char*)path):stdin;
  if(!input){io_error=1;return;}
  if(input_owned){int64_t size=regular_size(input);if(size<0){io_error=1;mm_cli_close();return;}if(size>max_bytes){io_error=3;mm_cli_close();return;}}
  line_buffer=malloc((size_t)max_line+1);line_capacity=max_line;
  if(!line_buffer){io_error=1;mm_cli_close();}
}
static moonbit_bytes_t read_line(int32_t max_bytes,int raw) {
  io_error=0;int used=0;
  if(!input){io_error=1;return moonbit_make_bytes(0,0);}
  for(;;){
    int ch=fgetc(input);
    if(ch==EOF){if(ferror(input))io_error=1;else if(!used)io_error=-1;break;}
    input_total++;if(input_total>max_bytes){io_error=3;break;}
    if(ch=='\n'){if(raw)line_buffer[used++]=(unsigned char)ch;break;}
    if(used>=line_capacity){io_error=4;break;}
    line_buffer[used++]=(unsigned char)ch;
  }
  if(io_error){return moonbit_make_bytes(0,0);}
  if(!raw && used && line_buffer[used-1]=='\r')used--;
  moonbit_bytes_t out=moonbit_make_bytes(used,0);memcpy(out,line_buffer,used);return out;
}
moonbit_bytes_t mm_cli_line(int32_t max_bytes) { return read_line(max_bytes,0); }
moonbit_bytes_t mm_cli_raw_line(int32_t max_bytes) { return read_line(max_bytes,1); }
int32_t mm_cli_write(moonbit_bytes_t bytes,int32_t length,int32_t channel) {
  FILE *f=channel?stderr:stdout;
  if(fwrite(bytes,1,length,f)!=(size_t)length || fflush(f))return 1;
  return 0;
}

// Reject output aliases before processing and immediately before publication.
int32_t mm_cli_output_check(moonbit_bytes_t output,moonbit_bytes_t protected_path,int32_t overwrite) {
#ifdef _WIN32
  wchar_t *out=wide_path((char*)output),*src=wide_path((char*)protected_path);
  if(!out||!src){free(out);free(src);return 1;}
  wchar_t *a=_wfullpath(NULL,out,0),*b=_wfullpath(NULL,src,0);
  int bad=!a||!b||_wcsicmp(a,b)==0;free(a);free(b);
  DWORD attr=GetFileAttributesW(out);
  if(attr!=INVALID_FILE_ATTRIBUTES && (!overwrite||(attr&(FILE_ATTRIBUTE_DIRECTORY|FILE_ATTRIBUTE_REPARSE_POINT))))bad=1;
  HANDLE x=CreateFileW(out,0,FILE_SHARE_READ|FILE_SHARE_WRITE|FILE_SHARE_DELETE,NULL,OPEN_EXISTING,FILE_ATTRIBUTE_NORMAL,NULL);
  HANDLE y=CreateFileW(src,0,FILE_SHARE_READ|FILE_SHARE_WRITE|FILE_SHARE_DELETE,NULL,OPEN_EXISTING,FILE_ATTRIBUTE_NORMAL,NULL);
  BY_HANDLE_FILE_INFORMATION xi,yi;
  if(y==INVALID_HANDLE_VALUE)bad=1;
  if(x!=INVALID_HANDLE_VALUE&&y!=INVALID_HANDLE_VALUE&&GetFileInformationByHandle(x,&xi)&&GetFileInformationByHandle(y,&yi)&&xi.dwVolumeSerialNumber==yi.dwVolumeSerialNumber&&xi.nFileIndexHigh==yi.nFileIndexHigh&&xi.nFileIndexLow==yi.nFileIndexLow)bad=1;
  if(x!=INVALID_HANDLE_VALUE)CloseHandle(x);if(y!=INVALID_HANDLE_VALUE)CloseHandle(y);
  free(out);free(src);return bad;
#else
  struct stat a,b;
  if(stat((char*)protected_path,&b))return 1;
  if(!lstat((char*)output,&a))return !overwrite||!S_ISREG(a.st_mode)||(a.st_dev==b.st_dev&&a.st_ino==b.st_ino);
  return errno!=ENOENT;
#endif
}

int32_t mm_cli_publish(moonbit_bytes_t path,moonbit_bytes_t bytes,int32_t length,int32_t overwrite) {
#ifdef _WIN32
  wchar_t *out=wide_path((char*)path);if(!out)return 1;
  size_t cap=wcslen(out)+80;wchar_t *temp=malloc(cap*sizeof(wchar_t));if(!temp){free(out);return 1;}
  HANDLE file=INVALID_HANDLE_VALUE;
  for(int n=0;n<100&&file==INVALID_HANDLE_VALUE;n++){
    swprintf(temp,cap,L"%ls.moonmmdb-%lu-%d.tmp",out,GetCurrentProcessId(),n);
    file=CreateFileW(temp,GENERIC_WRITE,0,NULL,CREATE_NEW,FILE_ATTRIBUTE_NORMAL,NULL);
    if(file==INVALID_HANDLE_VALUE&&GetLastError()!=ERROR_FILE_EXISTS)break;
  }
  int bad=1;
  if(file!=INVALID_HANDLE_VALUE){DWORD written=0;bad=!WriteFile(file,bytes,(DWORD)length,&written,NULL)||written!=(DWORD)length||!FlushFileBuffers(file);if(!CloseHandle(file))bad=1;
    if(!bad)bad=!MoveFileExW(temp,out,MOVEFILE_WRITE_THROUGH|(overwrite?MOVEFILE_REPLACE_EXISTING:0));
    if(bad)DeleteFileW(temp);
  }
  free(temp);free(out);return bad;
#else
  size_t cap=strlen((char*)path)+40;char *temp=malloc(cap);if(!temp)return 1;
  snprintf(temp,cap,"%s.moonmmdb-XXXXXX",(char*)path);
  int fd=mkstemp(temp);if(fd<0){free(temp);return 1;}
  int bad=0;size_t used=0;
  while(used<(size_t)length){ssize_t n=write(fd,bytes+used,(size_t)length-used);if(n<0&&errno==EINTR)continue;if(n<=0){bad=1;break;}used+=(size_t)n;}
  if(fsync(fd))bad=1;if(close(fd))bad=1;
  if(!bad){if(overwrite)bad=rename(temp,(char*)path)!=0;else bad=link(temp,(char*)path)!=0;}
  unlink(temp);free(temp);return bad;
#endif
}
