import { describe, expect, it } from 'vitest'
import { CSV_BOM, CSV_SEPARATOR, formatCell, toCsv } from '../../server/utils/csv'

/**
 * CU-14 — Exporter les indicateurs.
 *
 * L'export part du serveur et s'ouvre dans un tableur, sur un poste qu'on ne
 * maîtrise pas. Deux risques s'y logent : une donnée mal formée qui rend le
 * fichier illisible, et une cellule que le tableur prend pour une formule.
 */

describe('formatCell', () => {
  it('laisse le texte ordinaire intact', () => {
    expect(formatCell('Nova Solutions')).toBe('Nova Solutions')
  })

  it('écrit les entiers sans décoration', () => {
    expect(formatCell(0)).toBe('0')
    expect(formatCell(42)).toBe('42')
  })

  // Séparateur de colonnes au point-virgule, virgule décimale : c'est ce
  // qu'attend un tableur en locale française, et ce qui évite l'assistant
  // d'importation.
  it('écrit les décimaux à la française', () => {
    expect(formatCell(4.2)).toBe('4,2')
    expect(formatCell(2.55)).toBe('2,6')
  })

  // Une journée masquée par le seuil d'anonymat n'est pas une journée à zéro.
  it('rend une cellule vide pour une valeur absente', () => {
    expect(formatCell(null)).toBe('')
  })

  it('protège les cellules contenant le séparateur ou un guillemet', () => {
    expect(formatCell('Produit; Support')).toBe('"Produit; Support"')
    expect(formatCell('Équipe "Produit"')).toBe('"Équipe ""Produit"""')
    expect(formatCell('deux\nlignes')).toBe('"deux\nlignes"')
  })

  // Injection de formule : le vecteur est un nom d'équipe ou d'entreprise, saisi
  // par un humain. Sans neutralisation, la cellule s'exécute à l'ouverture.
  it('neutralise une cellule que le tableur lirait comme une formule', () => {
    expect(formatCell('=1+1')).toBe(`'=1+1`)
    expect(formatCell('@SUM(A1)')).toBe(`'@SUM(A1)`)
    expect(formatCell('+33 1 23 45 67 89')).toBe(`'+33 1 23 45 67 89`)
    expect(formatCell('-- commentaire')).toBe(`'-- commentaire`)
  })

  it('neutralise puis protège quand les deux s\'imposent', () => {
    expect(formatCell('=A1;B2')).toBe(`"'=A1;B2"`)
  })

  // Un nombre négatif commence lui aussi par un tiret : le préfixer d'une
  // apostrophe le transformerait en texte et l'export cesserait d'être
  // calculable.
  it('ne neutralise jamais un nombre négatif', () => {
    expect(formatCell(-3)).toBe('-3')
    expect(formatCell(-1.5)).toBe('-1,5')
  })
})

describe('toCsv', () => {
  const csv = toCsv(
    ['Journée', 'Pauses prises', 'Humeur moyenne'],
    [['2026-08-24', 3, 4.2], ['2026-08-25', 0, null]],
  )

  // Sans marque d'ordre d'octets, Excel lit l'UTF-8 comme du Windows-1252 et
  // rend « Journée » en « JournÃ©e ».
  it('commence par la marque d\'ordre d\'octets', () => {
    expect(csv.startsWith(CSV_BOM)).toBe(true)
  })

  it('assemble l\'en-tête puis les lignes', () => {
    const lines = csv.slice(CSV_BOM.length).trimEnd().split('\r\n')

    expect(lines[0]).toBe(['Journée', 'Pauses prises', 'Humeur moyenne'].join(CSV_SEPARATOR))
    expect(lines[1]).toBe(['2026-08-24', '3', '4,2'].join(CSV_SEPARATOR))
    expect(lines[2]).toBe(['2026-08-25', '0', ''].join(CSV_SEPARATOR))
  })

  // RFC 4180, et ce qu'attendent les tableurs sous Windows — où ce fichier
  // finira le plus souvent.
  it('termine ses lignes en CRLF', () => {
    expect(csv.endsWith('\r\n')).toBe(true)
    expect(csv).not.toMatch(/[^\r]\n/)
  })

  it('produit un fichier avec le seul en-tête quand il n\'y a rien à dire', () => {
    expect(toCsv(['Journée'], [])).toBe(`${CSV_BOM}Journée\r\n`)
  })
})
