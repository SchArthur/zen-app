export interface MailContent {
  subject: string
  text: string
  html: string
}

// Le prénom vient d'une saisie utilisateur : il est réinjecté dans du HTML,
// il doit donc être échappé, exactement comme dans une page.
function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function layout(title: string, body: string) {
  return `<!doctype html>
<html lang="fr">
  <body style="margin:0;padding:24px;background:#f5f7fb;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#243043;">
    <table role="presentation" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px;">
      <tr>
        <td>
          <p style="margin:0 0 24px;font-size:18px;font-weight:600;color:#4c6ef5;">ZenTime</p>
          <h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;">${escapeHtml(title)}</h1>
          ${body}
        </td>
      </tr>
    </table>
  </body>
</html>`
}

// `layout` et `button` échappent eux-mêmes ce qu'ils reçoivent : les appelants
// leur passent du texte brut, jamais du HTML déjà préparé.
function button(url: string, label: string) {
  const href = escapeHtml(url)

  return `<p style="margin:24px 0;">
    <a href="${href}" style="display:inline-block;background:#4c6ef5;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600;">${escapeHtml(label)}</a>
  </p>
  <p style="margin:0 0 8px;font-size:13px;color:#61708a;">Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :</p>
  <p style="margin:0;font-size:13px;word-break:break-all;"><a href="${href}" style="color:#4c6ef5;">${href}</a></p>`
}

/** CU-02.1 — lien de confirmation d'adresse, à durée limitée. */
export function verificationEmail(options: { firstName: string, url: string, ttlHours: number }): MailContent {
  const { firstName, url, ttlHours } = options

  return {
    subject: 'Confirmez votre adresse email — ZenTime',
    text: [
      `Bonjour ${firstName},`,
      '',
      'Votre compte ZenTime a été créé, mais il reste inactif tant que vous n\'avez pas confirmé cette adresse email.',
      '',
      'Confirmez votre adresse en ouvrant ce lien :',
      url,
      '',
      `Ce lien expire dans ${ttlHours} heures. Passé ce délai, vous pourrez en demander un nouveau depuis la page d'inscription.`,
      '',
      'Si vous n\'êtes pas à l\'origine de cette demande, ignorez ce message : aucun compte ne sera activé.',
      '',
      'L\'équipe ZenTime',
    ].join('\n'),
    html: layout(
      `Bonjour ${firstName}, confirmez votre adresse`,
      `<p style="margin:0 0 8px;line-height:1.6;">Votre compte ZenTime a été créé, mais il reste <strong>inactif</strong> tant que cette adresse n'est pas confirmée.</p>
      ${button(url, 'Confirmer mon adresse')}
      <p style="margin:24px 0 0;font-size:13px;color:#61708a;line-height:1.6;">Ce lien expire dans ${ttlHours} heures. Si vous n'êtes pas à l'origine de cette demande, ignorez ce message : aucun compte ne sera activé.</p>`,
    ),
  }
}

/**
 * CU-02, alternative A1 — une inscription a été tentée sur une adresse déjà
 * confirmée. Le visiteur reçoit la même réponse que dans le cas nominal ; c'est
 * le titulaire du compte, et lui seul, qui est informé de la tentative.
 */
export function existingAccountEmail(options: { firstName: string, loginUrl: string }): MailContent {
  const { firstName, loginUrl } = options

  return {
    subject: 'Une inscription a été tentée avec votre adresse — ZenTime',
    text: [
      `Bonjour ${firstName},`,
      '',
      'Quelqu\'un vient de demander la création d\'un compte ZenTime avec votre adresse email. Un compte existe déjà : aucun nouveau compte n\'a été créé et votre mot de passe n\'a pas été modifié.',
      '',
      'Si c\'était vous, connectez-vous simplement :',
      loginUrl,
      '',
      'Si ce n\'était pas vous, aucune action n\'est nécessaire.',
      '',
      'L\'équipe ZenTime',
    ].join('\n'),
    html: layout(
      `Bonjour ${firstName}, votre compte existe déjà`,
      `<p style="margin:0 0 8px;line-height:1.6;">Une création de compte vient d'être demandée avec votre adresse email. Un compte existe déjà : <strong>aucun nouveau compte n'a été créé</strong> et votre mot de passe n'a pas été modifié.</p>
      ${button(loginUrl, 'Me connecter')}
      <p style="margin:24px 0 0;font-size:13px;color:#61708a;line-height:1.6;">Si vous n'êtes pas à l'origine de cette demande, aucune action n'est nécessaire.</p>`,
    ),
  }
}
