/* Reuse precisely the product host boundary; this is a verification consumer. */
#include "../../native_cli/io.c"
void mm_soak_flush(void) { fflush(stdout); }
