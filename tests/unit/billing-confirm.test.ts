import Stripe from 'stripe'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { createError } = vi.hoisted(() => {
  const createError = vi.fn((input: { statusCode: number, statusMessage: string, data: Record<string, unknown> }) =>
    Object.assign(new Error(input.statusMessage), input))

  Object.assign(globalThis, {
    createError,
    defineEventHandler: <T>(handler: T) => handler,
  })

  return { createError }
})

const { throwCheckoutSessionRetrieveError } = await import('../../server/api/billing/confirm.post')

describe('throwCheckoutSessionRetrieveError', () => {
  beforeEach(() => {
    createError.mockClear()
  })

  it('traduit seulement une session absente en 404', () => {
    const error = Object.assign(
      Object.create(Stripe.errors.StripeInvalidRequestError.prototype),
      { code: 'resource_missing' },
    )

    expect(() => throwCheckoutSessionRetrieveError(error)).toThrowError(
      expect.objectContaining({
        statusCode: 404,
        data: { code: 'checkout_session_unknown' },
      }),
    )
  })

  it('traduit les autres erreurs Stripe en 502', () => {
    const error = Object.assign(
      Object.create(Stripe.errors.StripeConnectionError.prototype),
      { message: 'connect ECONNRESET' },
    )

    expect(() => throwCheckoutSessionRetrieveError(error)).toThrowError(
      expect.objectContaining({
        statusCode: 502,
        data: { code: 'checkout_session_unavailable' },
      }),
    )
  })

  it('propage une erreur qui ne vient pas du prestataire', () => {
    const error = new Error('boom')

    try {
      throwCheckoutSessionRetrieveError(error)
      expect.unreachable('Une erreur non-Stripe aurait dû être propagée telle quelle.')
    }
    catch (caught) {
      expect(caught).toBe(error)
    }
  })
})
