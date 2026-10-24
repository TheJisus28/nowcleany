import { describe, expect, it } from 'vitest';
import { ForbiddenError, Quantity, ValidationError } from '../../../shared-kernel/index.js';
import {
  assertCanPublish,
  type FormulaDefinition,
  type FormulaProduct,
  requirements,
  validateFormula,
} from '../domain/formula.js';

const product = (
  id: string,
  type: FormulaProduct['type'],
  dimension: FormulaProduct['dimension'],
): FormulaProduct => ({ id, code: id.toUpperCase(), type, dimension, active: true });

const L = (value: string) => Quantity.parse(value, 'L');
const kg = (value: string) => Quantity.parse(value, 'kg');
const un = (value: string) => Quantity.parse(value, 'un');

// Brief acceptance case (illustrative figures): "Cloro 5% botella 1 L", batch of 1000 units.
const chlorineBottle: FormulaDefinition = {
  batchYield: un('1000'),
  lines: [
    { componentId: 'hypochlorite', quantity: L('400'), wasteBps: 100 },
    { componentId: 'water', quantity: L('590'), wasteBps: 0 },
    { componentId: 'caustic-soda', quantity: kg('5'), wasteBps: 0 },
    { componentId: 'bottle-1l', quantity: un('1000'), wasteBps: 100 },
    { componentId: 'cap', quantity: un('1000'), wasteBps: 0 },
    { componentId: 'label', quantity: un('1000'), wasteBps: 0 },
  ],
};

describe('formula requirements', () => {
  it('matches the chlorine acceptance case exactly for 250 units', () => {
    const result = requirements(chlorineBottle, un('250'));
    const formatted = Object.fromEntries(
      result.map(({ componentId, quantity }) => [
        componentId,
        quantity.format(
          quantity.dimension === 'MASS' ? 'kg' : quantity.dimension === 'VOLUME' ? 'L' : 'un',
        ),
      ]),
    );
    expect(formatted).toEqual({
      hypochlorite: '101',
      water: '147.5',
      'caustic-soda': '1.25',
      'bottle-1l': '253',
      cap: '250',
      label: '250',
    });
  });

  it('chains two levels: a 2 L × 6 box needs 12 L of bulk, and the bulk needs chemicals', () => {
    const box: FormulaDefinition = {
      batchYield: un('1'),
      lines: [
        { componentId: 'bulk', quantity: L('12'), wasteBps: 0 },
        { componentId: 'bottle-2l', quantity: un('6'), wasteBps: 0 },
      ],
    };
    const bulk: FormulaDefinition = {
      batchYield: L('25000'),
      lines: [{ componentId: 'hypochlorite', quantity: L('10000'), wasteBps: 0 }],
    };
    const [bulkNeed] = requirements(box, un('950'));
    expect(bulkNeed?.quantity.format('L')).toBe('11400');
    const [chemical] = requirements(bulk, bulkNeed?.quantity ?? L('0'));
    expect(chemical?.quantity.format('L')).toBe('4560');
  });

  it('never rounds a fractional requirement down', () => {
    const tiny: FormulaDefinition = {
      batchYield: un('3'),
      lines: [{ componentId: 'label', quantity: un('1'), wasteBps: 0 }],
    };
    expect(requirements(tiny, un('1'))[0]?.quantity.base).toBe(1n);
  });
});

describe('formula validation', () => {
  const components = new Map([
    ['hypochlorite', product('hypochlorite', 'RAW_MATERIAL', 'VOLUME')],
    ['bulk', product('bulk', 'BULK', 'VOLUME')],
    ['box', product('box', 'FINISHED_GOOD', 'COUNT')],
  ]);

  it('lets a bulk use only raw materials', () => {
    const bulk = product('bulk-2', 'BULK', 'VOLUME');
    expect(() => {
      validateFormula(
        bulk,
        { batchYield: L('100'), lines: [{ componentId: 'bulk', quantity: L('1'), wasteBps: 0 }] },
        components,
      );
    }).toThrow(/solo puede usar materias primas/);
  });

  it('rejects formulas on raw materials, duplicate components and invalid waste', () => {
    const raw = product('raw', 'RAW_MATERIAL', 'MASS');
    const definition = { batchYield: kg('1'), lines: [] };
    expect(() => {
      validateFormula(raw, definition, components);
    }).toThrow(ValidationError);

    const box = product('box-2', 'FINISHED_GOOD', 'COUNT');
    expect(() => {
      validateFormula(
        box,
        {
          batchYield: un('1'),
          lines: [
            { componentId: 'bulk', quantity: L('1'), wasteBps: 0 },
            { componentId: 'bulk', quantity: L('2'), wasteBps: 0 },
          ],
        },
        components,
      );
    }).toThrow(/más de una vez/);
    expect(() => {
      validateFormula(
        box,
        {
          batchYield: un('1'),
          lines: [{ componentId: 'bulk', quantity: L('1'), wasteBps: 10_001 }],
        },
        components,
      );
    }).toThrow(/merma/);
  });

  it('enforces the four-eyes rule unless the publisher may publish their own', () => {
    const draft = { status: 'DRAFT' as const, createdBy: 'ana' };
    expect(() => {
      assertCanPublish(draft, { id: 'ana', canPublishOwn: false });
    }).toThrow(ForbiddenError);
    expect(() => {
      assertCanPublish(draft, { id: 'ana', canPublishOwn: true });
    }).not.toThrow();
    expect(() => {
      assertCanPublish(draft, { id: 'luis', canPublishOwn: false });
    }).not.toThrow();
  });
});
