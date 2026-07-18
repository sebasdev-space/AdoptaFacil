import { Injectable } from '@nestjs/common';
import bcrypt from 'bcryptjs';

/**
 * Password hashing with bcrypt (bcryptjs — pure JS, no native build). Plaintext
 * passwords are only ever received transiently here and never stored or logged.
 */
@Injectable()
export class PasswordService {
  /** Cost factor; 12 is a sensible default for interactive login latency. */
  private readonly rounds = 12;

  /** A fixed valid hash used to equalize timing when a user is not found. */
  static readonly DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', 12);

  async hash(plain: string): Promise<string> {
    return bcrypt.hash(plain, this.rounds);
  }

  async verify(plain: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plain, hash);
  }
}
