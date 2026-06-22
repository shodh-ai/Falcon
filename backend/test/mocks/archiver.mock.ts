export class ZipArchive {
  on(_event: string, _handler: (...args: unknown[]) => void) {
    return this;
  }

  pipe(_dest: unknown) {
    return this;
  }

  append(_source: unknown, _options?: unknown) {
    return this;
  }

  finalize() {
    return Promise.resolve();
  }
}

export default function archiver() {
  return new ZipArchive();
}
