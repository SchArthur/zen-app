import { describe, expect, it } from 'vitest'
import { existingAccountEmail, verificationEmail } from '../../server/utils/mail-templates'

const url = 'http://localhost:3000/api/auth/verify-email?token=abc123'

describe('verificationEmail', () => {
  const mail = verificationEmail({ firstName: 'Alice', url, ttlHours: 24 })

  it('porte le lien de confirmation dans les deux versions du message', () => {
    expect(mail.text).toContain(url)
    expect(mail.html).toContain(`href="${url}"`)
  })

  it('annonce la durée de validité', () => {
    expect(mail.text).toContain('24 heures')
    expect(mail.html).toContain('24 heures')
  })

  it('s\'adresse au destinataire', () => {
    expect(mail.text).toContain('Bonjour Alice')
    expect(mail.subject).toBe('Confirmez votre adresse email — ZenTime')
  })

  it('échappe le prénom : il vient d\'une saisie utilisateur', () => {
    const injected = verificationEmail({
      firstName: '<script>alert(1)</script>',
      url,
      ttlHours: 24,
    })

    expect(injected.html).not.toContain('<script>')
    expect(injected.html).toContain('&lt;script&gt;')
  })
})

describe('existingAccountEmail', () => {
  const mail = existingAccountEmail({ firstName: 'Alice', loginUrl: 'http://localhost:3000/connexion' })

  it('oriente vers la connexion plutôt que vers une création de compte', () => {
    expect(mail.text).toContain('http://localhost:3000/connexion')
    expect(mail.html).toContain('href="http://localhost:3000/connexion"')
  })

  it('indique qu\'aucun compte n\'a été créé ni modifié', () => {
    expect(mail.text).toContain('aucun nouveau compte n\'a été créé')
    expect(mail.text).toContain('votre mot de passe n\'a pas été modifié')
  })

  it('ne contient aucun lien de confirmation : il n\'y a rien à confirmer', () => {
    expect(mail.text).not.toContain('verify-email')
    expect(mail.html).not.toContain('verify-email')
  })
})
