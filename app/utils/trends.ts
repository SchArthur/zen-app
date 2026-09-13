/**
 * Mise en forme d'un écart avec la période précédente.
 *
 * Partagée par le tableau de bord personnel, la vue d'équipe et la vue
 * entreprise : les trois affichent la même chose et doivent la dire des mêmes
 * mots. Une seule définition, sinon « stable » finit par vouloir dire deux
 * choses selon l'écran.
 *
 * Les écarts sont des **différences**, jamais des pourcentages : sur une
 * douzaine de pauses, « + 3 » informe davantage que « + 50 % » et impressionne
 * moins. Le produit ne cherche pas à faire de la performance.
 */
export interface Trend {
  label: string
  tone: string
}

export function formatTrend(
  value: number | null,
  options: { decimals?: boolean, invert?: boolean } = {},
): Trend {
  // `null` signifie « rien à comparer », pas « stable » : on le dit, plutôt que
  // d'afficher un zéro qui se lirait comme une absence de progrès.
  if (value === null) return { label: 'pas de point de comparaison', tone: 'text-fg-faint' }

  const rounded = options.decimals ? Math.round(value * 10) / 10 : Math.round(value)

  if (rounded === 0) return { label: 'stable', tone: 'text-fg-faint' }

  const formatted = Math.abs(rounded).toLocaleString('fr-FR', { maximumFractionDigits: 1 })
  const rising = rounded > 0
  // Sur le stress, monter est la mauvaise direction : la teinte suit le sens,
  // pas le signe.
  const good = options.invert ? !rising : rising

  return {
    label: `${rising ? '+' : '−'} ${formatted} vs période précédente`,
    tone: good ? 'text-success-strong' : 'text-warning-strong',
  }
}
