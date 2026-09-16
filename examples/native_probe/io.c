// Host file I/O and timing only. All MMDB parsing and lookup remain in MoonBit.
#include <moonbit.h>
#include <stdio.h>
#include <stdlib.h>
#include <stdint.h>
#include <string.h>
#ifdef _WIN32
#include <windows.h>
#include <shellapi.h>
#else
#include <time.h>
#endif

static int io_error = 0;
int32_t moonmmdb_probe_error(void) { return io_error; }
// Pinned MoonBit's MinGW env.args uses ANSI bytes. Read the Windows Unicode
// command line at this host boundary; do not modify the MoonBit runtime.
moonbit_string_t moonmmdb_probe_arg(int32_t index, moonbit_string_t fallback) {
#ifdef _WIN32
  int count = 0;
  LPWSTR *args = CommandLineToArgvW(GetCommandLineW(), &count);
  if (!args || index < 0 || index >= count) {
    if (args) LocalFree(args);
    moonbit_incref(fallback);
    return fallback;
  }
  int32_t size = (int32_t)wcslen(args[index]);
  moonbit_string_t result = moonbit_make_string_raw(size);
  memcpy(result, args[index], (size_t)size * sizeof(wchar_t));
  LocalFree(args);
  return result;
#else
  moonbit_incref(fallback);
  return fallback;
#endif
}
moonbit_bytes_t moonmmdb_probe_read(moonbit_bytes_t path, int32_t limit) {
  FILE *file = NULL;
  io_error = 0;
#ifdef _WIN32
  int wide_size = MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, (const char *)path, -1, NULL, 0);
  wchar_t *wide = wide_size ? (wchar_t *)malloc((size_t)wide_size * sizeof(wchar_t)) : NULL;
  if (wide) {
    if (MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, (const char *)path, -1, wide, wide_size)) file = _wfopen(wide, L"rb");
    free(wide);
  }
#else
  file = fopen((const char *)path, "rb");
#endif
  if (!file) { io_error = 1; return moonbit_make_bytes(0, 0); }
  if (fseek(file, 0, SEEK_END)) { fclose(file); io_error = 2; return moonbit_make_bytes(0, 0); }
  long size = ftell(file);
  if (size < 0 || size > limit || fseek(file, 0, SEEK_SET)) { fclose(file); io_error = 3; return moonbit_make_bytes(0, 0); }
  moonbit_bytes_t bytes = moonbit_make_bytes((int32_t)size, 0);
  if (fread(bytes, 1, (size_t)size, file) != (size_t)size) {
    moonbit_decref(bytes); fclose(file); io_error = 4; return moonbit_make_bytes(0, 0);
  }
  fclose(file);
  return bytes;
}

double moonmmdb_probe_now(void) {
#ifdef _WIN32
  LARGE_INTEGER counter, frequency;
  QueryPerformanceCounter(&counter); QueryPerformanceFrequency(&frequency);
  return (double)counter.QuadPart * 1000.0 / (double)frequency.QuadPart;
#else
  struct timespec time;
  clock_gettime(CLOCK_MONOTONIC, &time);
  return (double)time.tv_sec * 1000.0 + (double)time.tv_nsec / 1000000.0;
#endif
}
