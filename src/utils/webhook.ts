import { createHmac } from 'node:crypto';

export class WebhookValidator {
  private secret: string;

  constructor(secret: string) {
    this.secret = secret;
  }

  /**
   * Verify GitHub webhook signature
   */
  verifySignature(payload: string, signature: string): boolean {
    if (!signature) {
      console.error('No signature provided');
      return false;
    }

    const expectedSignature = this.generateSignature(payload);
    const providedSignature = signature.replace('=', '');

    console.log('Expected signature:', expectedSignature);
    console.log('Provided signature:', providedSignature);

    // Use timing-safe comparison to prevent timing attacks
    return this.timingSafeEqual(expectedSignature, providedSignature);
  }

  /**
   * Generate HMAC signature for payload
   */
  private generateSignature(payload: string): string {
    return createHmac('sha256', this.secret)
      .update(payload, 'utf8')
      .digest('hex');
  }

  /**
   * Timing-safe string comparison
   */
  private timingSafeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) {
      return false;
    }

    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }

    return result === 0;
  }
}
