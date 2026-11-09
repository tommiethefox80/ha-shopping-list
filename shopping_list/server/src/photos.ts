import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { newId } from './domain.js';

/** Item photos ("this exact one"), stored as JPEGs in /data/photos. The app resizes before upload. */
export class Photos {
  private readonly dir: string;
  constructor(dataDir: string) {
    this.dir = join(dataDir, 'photos');
    mkdirSync(this.dir, { recursive: true });
  }
  save(jpeg: Buffer): string {
    if (jpeg.length < 4 || jpeg[0] !== 0xff || jpeg[1] !== 0xd8) throw new Error('Photo must be a JPEG');
    const id = newId();
    writeFileSync(join(this.dir, `${id}.jpg`), jpeg);
    return id;
  }
  read(id: string): Buffer | undefined {
    if (!/^[0-9a-f-]{36}$/.test(id)) return undefined;
    const f = join(this.dir, `${id}.jpg`);
    return existsSync(f) ? readFileSync(f) : undefined;
  }
  remove(id?: string) {
    if (id && /^[0-9a-f-]{36}$/.test(id)) rmSync(join(this.dir, `${id}.jpg`), { force: true });
  }
}
