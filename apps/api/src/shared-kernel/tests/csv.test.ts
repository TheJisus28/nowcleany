import { describe, expect, it } from 'vitest';
import { normaliseDecimal, parseCsv } from '../csv.js';
import { ValidationError } from '../errors.js';

const BOM = String.fromCharCode(0xfeff);
const CRLF = String.fromCharCode(13, 10);
const LF = String.fromCharCode(10);

describe('parseCsv', () => {
  it('reads semicolon files from Spanish Excel with BOM, CRLF, accents and quotes', () => {
    const text = [
      'Código;Nombre;Tipo;Unidad',
      'MP-AGUA;Agua tratada;materia prima;L',
      '00224;"Caja x 2 L; x 6";terminado;un',
      '',
    ].join(CRLF);
    const rows = parseCsv(BOM + text, ['codigo', 'nombre', 'tipo', 'unidad']);
    expect(rows).toHaveLength(2);
    expect(rows[0]?.values['codigo']).toBe('MP-AGUA');
    expect(rows[1]).toEqual({
      line: 3,
      values: { codigo: '00224', nombre: 'Caja x 2 L; x 6', tipo: 'terminado', unidad: 'un' },
    });
  });

  it('detects comma separators and reports missing columns', () => {
    expect(parseCsv(['codigo,cantidad', 'X,1'].join(LF), ['codigo'])[0]?.values['cantidad']).toBe(
      '1',
    );
    expect(() => parseCsv('codigo;nombre', ['codigo', 'unidad'])).toThrow(ValidationError);
  });

  it('normalises decimal commas', () => {
    expect(normaliseDecimal('1 250,5')).toBe('1250.5');
  });
});
