export class BackendEventLoop {
  private generation = 0;
  private controller: AbortController | null = null;
  private running: Promise<void> | null = null;
  private pending: ((signal: AbortSignal, generation: number) => Promise<void>) | null = null;

  start(run: (signal: AbortSignal, generation: number) => Promise<void>): void {
    if (this.running) {
      if (this.controller?.signal.aborted) this.pending = run;
      return;
    }
    this.launch(run);
  }

  private launch(run: (signal: AbortSignal, generation: number) => Promise<void>): void {
    const generation = ++this.generation;
    const controller = new AbortController();
    this.controller = controller;
    const running = Promise.resolve().then(() => run(controller.signal, generation));
    this.running = running;
    void running.finally(() => {
      if (this.running !== running) return;
      this.running = null;
      this.controller = null;
      const pending = this.pending;
      this.pending = null;
      if (pending) this.launch(pending);
    }).catch(() => {});
  }

  current(generation: number): boolean {
    return generation === this.generation && !this.controller?.signal.aborted;
  }

  async stop(): Promise<void> {
    ++this.generation;
    const controller = this.controller;
    const running = this.running;
    this.pending = null;
    controller?.abort();
    await running?.catch(() => {});
  }

  active(): boolean {
    return this.running !== null;
  }
}
