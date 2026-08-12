import { SingleFlight } from "@shared/generation";

export class BackendEventLoop {
  private readonly flight = new SingleFlight();

  start(run: () => Promise<void>): void {
    this.flight.start(run);
  }

  active(): boolean {
    return this.flight.active();
  }
}
