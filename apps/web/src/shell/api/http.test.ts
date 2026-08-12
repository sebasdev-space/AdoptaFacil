import { describe, expect, it } from 'vitest';
import { apiErrorFromResponse } from './http';

function jsonResponse(status: number, statusText: string, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, statusText });
}

describe('apiErrorFromResponse', () => {
  it('uses a plain string `message` verbatim', async () => {
    const error = await apiErrorFromResponse(
      jsonResponse(409, 'Conflict', {
        message: 'Este nombre de portal ya está en uso. Elige otro.',
      }),
    );
    expect(error.message).toBe('Este nombre de portal ya está en uso. Elige otro.');
  });

  /**
   * Regression: `ZodValidationPipe` (backend) throws `BadRequestException(string[])`
   * — Nest serializes that as `message: string[]` VERBATIM, never joined into one
   * string. Before this fix, an array `message` fell through to the generic
   * `response.statusText` ("Bad Request"), hiding the actual validation reason
   * (e.g. the slug format message) from the user.
   */
  it('joins an array-shaped `message` (Zod validation errors) instead of falling back to statusText', async () => {
    const error = await apiErrorFromResponse(
      jsonResponse(400, 'Bad Request', {
        message: [
          'slug: Solo se permiten letras minúsculas, números y guiones — sin espacios ni tildes.',
        ],
      }),
    );
    expect(error.message).toBe(
      'slug: Solo se permiten letras minúsculas, números y guiones — sin espacios ni tildes.',
    );
  });

  it('falls back to statusText when the body has no usable message', async () => {
    const error = await apiErrorFromResponse(jsonResponse(500, 'Internal Server Error', {}));
    expect(error.message).toBe('Internal Server Error');
  });

  it('falls back to statusText when the JSON body fails to parse', async () => {
    const response = new Response('not json', { status: 500, statusText: 'Internal Server Error' });
    const error = await apiErrorFromResponse(response);
    expect(error.message).toBe('Internal Server Error');
  });
});
