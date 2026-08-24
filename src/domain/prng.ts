/**
 * Gerador pseudoaleatório com semente fixa.
 * A base falsa precisa ser SEMPRE a mesma a cada carregamento — senão os
 * números do painel mudam a cada F5 e a demonstração perde credibilidade.
 */
export class PRNG {
  private s: number;

  constructor(seed = 20260819) {
    this.s = seed >>> 0;
  }

  /** mulberry32 — rápido e com boa distribuição para uso em mock */
  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** float entre min e max */
  float(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** inteiro entre min e max (inclusive) */
  int(min: number, max: number): number {
    return Math.floor(this.float(min, max + 1));
  }

  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }

  /** true com probabilidade p */
  chance(p: number): boolean {
    return this.next() < p;
  }

  /** distribuição normal (Box-Muller), truncada em [min,max] */
  normal(media: number, desvio: number, min: number, max: number): number {
    const u = Math.max(this.next(), 1e-9);
    const v = this.next();
    const n = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    return Math.min(max, Math.max(min, media + n * desvio));
  }

  /** escolhe um índice respeitando pesos */
  weighted(pesos: readonly number[]): number {
    const total = pesos.reduce((a, b) => a + b, 0);
    let r = this.next() * total;
    for (let i = 0; i < pesos.length; i++) {
      r -= pesos[i];
      if (r <= 0) return i;
    }
    return pesos.length - 1;
  }
}

export const NOMES = [
  'Ana Beatriz Ramos', 'Carlos Eduardo Lima', 'Mariana Duarte', 'Rafael Nogueira',
  'Juliana Prado', 'Bruno Tavares', 'Camila Moreira', 'Diego Fontes',
  'Patrícia Assis', 'Thiago Barbosa', 'Larissa Meireles', 'Gustavo Rocha',
  'Fernanda Vasques', 'Rodrigo Antunes', 'Isabela Cardoso', 'Marcelo Pires',
  'Vanessa Lopes', 'André Bittencourt', 'Renata Siqueira', 'Felipe Andrade',
  'Tatiane Cruz', 'Leonardo Peixoto', 'Débora Salles', 'Vinícius Xavier',
  'Priscila Monteiro', 'Eduardo Bastos', 'Natália Freitas', 'Henrique Dias',
  'Sabrina Coelho', 'Otávio Rezende',
];

export const COMERCIOS = [
  'Café Aurora', 'Mercado Bom Preço', 'Padaria Estrela', 'Drogaria Vida',
  'Empório Verde', 'Bistrô do Parque', 'Supermercado Central', 'Clínica Sorriso',
  'Shopping Alameda', 'Posto Trevo', 'Livraria Página', 'Restaurante Terrazza',
  'Hortifruti Colheita', 'Pet & Cia', 'Academia Movimento', 'Farmácia Saúde+',
  'Padaria Grão Fino', 'Mercearia do Bairro', 'Café Torra Lenta', 'Bistrô Girassol',
];
