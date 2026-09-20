// Bounded test transport only; comparison itself runs in the MoonBit library.
import { readFileSync } from 'node:fs';
import { open_database, prepare_fields, compare_prepared } from '../dist/core.mjs';
const requests = JSON.parse(readFileSync(0, 'utf8'));
const handles = new Map(), selections = new Map();
function handle(file) {
  if (!handles.has(file)) handles.set(file, open_database(readFileSync(file)));
  return handles.get(file);
}
const results = requests.map(request => {
  const key = JSON.stringify(request.paths);
  if (!selections.has(key)) selections.set(key, prepare_fields(request.paths));
  return JSON.parse(compare_prepared(handle(request.before), handle(request.after), request.ip, selections.get(key)));
});
process.stdout.write(JSON.stringify(results));
