import { createTransport, type Transporter } from 'nodemailer'
import type { H3Event } from 'h3'
import type { MailContent } from './mail-templates'

// Un seul transport pour tout le processus : chaque instance ouvre son propre
// pool de connexions SMTP.
let transporter: Transporter | undefined

function getTransporter(event: H3Event) {
  if (transporter) return transporter

  const { mail } = useRuntimeConfig(event)

  transporter = createTransport({
    host: mail.host,
    port: mail.port,
    secure: mail.secure,
    // Mailpit n'exige aucune authentification ; un fournisseur SMTP, si.
    auth: mail.user ? { user: mail.user, pass: mail.password } : undefined,
  })

  return transporter
}

export async function sendMail(event: H3Event, message: MailContent & { to: string }) {
  const { mail } = useRuntimeConfig(event)

  await getTransporter(event).sendMail({
    from: mail.from,
    to: message.to,
    subject: message.subject,
    text: message.text,
    html: message.html,
  })
}
