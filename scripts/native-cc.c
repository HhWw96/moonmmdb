// Compatibility launcher for this pinned MoonBit runtime and MinGW-w64.
// _CRT_RAND_S exposes the real CRT rand_s declaration; no runtime substitution.
#include <wchar.h>
#include <stdlib.h>
#include <process.h>
// The Windows CRT spawn API joins arguments without quoting them. Preserve
// spaces, quotes and trailing backslashes in each argument explicitly.
static wchar_t *quoted(const wchar_t *source) {
  wchar_t *result = malloc((wcslen(source) * 2 + 3) * sizeof(wchar_t));
  if (!result) return NULL;
  wchar_t *out = result; *out++ = L'"';
  for (;;) {
    size_t slashes = 0;
    while (*source == L'\\') { slashes++; source++; }
    if (*source == L'"' || *source == 0) slashes *= 2;
    while (slashes--) *out++ = L'\\';
    if (!*source) break;
    if (*source == L'"') *out++ = L'\\';
    *out++ = *source++;
  }
  *out++ = L'"'; *out = 0; return result;
}
int wmain(int argc, wchar_t **argv) {
  const wchar_t *gcc = _wgetenv(L"MOONMMDB_GCC");
  if (!gcc) return 2;
  wchar_t **forward = calloc((size_t)argc + 2, sizeof(*forward));
  if (!forward) return 2;
  forward[0] = quoted(gcc);
  forward[1] = quoted(L"-D_CRT_RAND_S");
  for (int i = 1; i < argc; ++i) forward[i + 1] = quoted(argv[i]);
  for (int i = 0; i <= argc; ++i) if (!forward[i]) return 2;
  intptr_t code = _wspawnv(_P_WAIT, gcc, (const wchar_t *const *)forward);
  for (int i = 0; i <= argc; ++i) free(forward[i]);
  free(forward);
  return code < 0 ? 2 : (int)code;
}
