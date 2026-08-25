/**
 * CU-09 — état de l'écran de déclaration : la déclaration du jour et celles qui
 * précèdent.
 *
 * Une seule route pour un seul écran, comme les autres. La déclaration du jour
 * est renvoyée à part de l'historique bien qu'elle en fasse partie : c'est elle
 * qui décide si le formulaire s'ouvre vierge ou pré-rempli pour correction
 * (alternative A1), et la retrouver dans la liste supposerait de recalculer la
 * journée courante côté navigateur — donc dans un autre fuseau que le serveur.
 *
 * Aucune donnée d'autrui ne transite ici : la route ne connaît qu'un
 * identifiant, celui de la session. Il n'y a pas de paramètre permettant de
 * demander la déclaration de quelqu'un d'autre, donc rien à contrôler.
 */
export default defineEventHandler(async (event) => {
  const { user } = await requireAuth(event)
  const { days } = validateQuery(event, moodQuerySchema)

  const now = new Date()

  const [today, history, consent] = await Promise.all([
    readTodayCheckIn(user.id, now),
    readCheckInHistory(user.id, days, now),
    readWellbeingConsent(user.id),
  ])

  return {
    today,
    history,
    days,
    // L'écran doit pouvoir expliquer pourquoi le formulaire est fermé plutôt que
    // de le présenter et de refuser à l'envoi (exception E1 de CU-09). Trois
    // états et non deux depuis le lot 7 : « jamais demandé » appelle la question,
    // là où « retiré » appelle une explication.
    consent: wellbeingConsentState(consent),
  }
})
