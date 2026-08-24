/**
 * Accord en nombre.
 *
 * La règle est celle déjà retenue à l'écran des statistiques : le singulier au
 * seul « un », le pluriel partout ailleurs — zéro compris. Elle est ici plutôt
 * que recopiée en ternaire dans chaque interpolation, parce qu'elle était déjà
 * écrite de deux façons différentes dans le produit et qu'un compteur affiché
 * « 1 pauses prises » se remarque immédiatement.
 *
 * Les formes irrégulières se passent en troisième argument (`plural(n, 'œil',
 * 'yeux')`) ; les cas courants se contentent du `s`.
 */
export function plural(count: number, singular: string, irregular?: string) {
  return count === 1 ? singular : irregular ?? `${singular}s`
}
