// Svuota dist/ prima della build, così non restano file di moduli rimossi
import { rmSync } from 'node:fs';

rmSync(new URL('../dist', import.meta.url), { recursive: true, force: true });
