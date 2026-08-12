export class BackendEventLoop {
  private generation = 0;
  private controller: AbortController | null = null;
  private running: Promise<void> | null = null;

  start(run: (signal: AbortSignal, generation: number) => Promise<void>): void {
    if (this.running) return;
    const generation = ++this.generation;
    const controller = new AbortController();
    this.controller = controller;
    const running = Promise.resolve().then(() => run(controller.signal, generation));
    this.running = running;
    void running.finally(() => {
      if (this.running !== running) return;
      this.running = null;
      this.controller = null;
    }).catch(() => {});
  }

  current(generation: number): boolean {
    return generation === this.generation && !this.controller?.signal.aborted;
  }

  async stop(): Promise<void> {
    ++this.generation;
    const controller = this.controller;
    const running = this.running;
    this.controller = null;
    this.running = null;
    controller?.abort();
    void running?.catch(() => {});
  }

  active(): boolean {
    return this.running !== null;
  }
}
