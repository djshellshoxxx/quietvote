// SPDX-License-Identifier: AGPL-3.0-or-later
/** One receipt check at a time, with invalidation when its visible input changes. */
export class ReceiptCheckGate {
  private revision = 0;
  private busy = false;

  invalidate(): void { this.revision++; }

  async run(operation: (current: () => boolean) => Promise<void>): Promise<boolean> {
    if (this.busy) return false;
    this.busy = true;
    const revision = ++this.revision;
    try {
      await operation(() => revision === this.revision);
      return true;
    } finally {
      this.busy = false;
    }
  }
}
