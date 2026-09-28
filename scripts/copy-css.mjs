// tsc non copia i file CSS: il foglio di stile della UI va portato in dist a mano
import { copyFileSync, mkdirSync } from 'node:fs';

mkdirSync(new URL('../dist/ui', import.meta.url), { recursive: true });
copyFileSync(
  new URL('../src/ui/hub-auth.css', import.meta.url),
  new URL('../dist/ui/hub-auth.css', import.meta.url),
);
