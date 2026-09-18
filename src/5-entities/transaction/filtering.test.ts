import type { TMerchant, TTransaction } from '6-shared/types'
import { describe, expect, test } from 'vitest'
import { checkRaw } from './filtering'

function makeTr(patch: Partial<TTransaction> = {}): TTransaction {
  return {
    id: 'tr1',
    changed: 0,
    created: 0,
    user: 0,
    deleted: false,
    hold: null,
    qrCode: null,
    incomeBankID: null,
    incomeInstrument: 2,
    incomeAccount: 'acc1',
    income: 0,
    outcomeBankID: null,
    outcomeInstrument: 2,
    outcomeAccount: 'acc1',
    outcome: 0,
    tag: null,
    merchant: null,
    payee: null,
    originalPayee: null,
    comment: null,
    date: '2026-01-15',
    mcc: null,
    reminderMarker: null,
    opIncome: null,
    opIncomeInstrument: null,
    opOutcome: null,
    opOutcomeInstrument: null,
    latitude: null,
    longitude: null,
    ...patch,
  }
}

const makeMerchant = (id: string, title: string): TMerchant => ({
  id,
  changed: 0,
  user: 0,
  title,
})

const matches = (
  tr: TTransaction,
  search: string,
  ctx?: Parameters<typeof checkRaw>[1]
) => checkRaw({ search }, ctx)(tr)

describe('checkRaw: поиск по суммам', () => {
  const outcome = makeTr({ outcome: 147600.5 })

  test('целое совпадает по целой части', () => {
    expect(matches(outcome, '147600')).toBe(true)
  })

  test('дробное требует точного совпадения', () => {
    expect(matches(outcome, '147600.50')).toBe(true)
    expect(matches(outcome, '147600.51')).toBe(false)
  })

  test('запятая работает как десятичный разделитель', () => {
    expect(matches(outcome, '147600,5')).toBe(true)
    expect(matches(outcome, '147600,51')).toBe(false)
  })

  test('пробелы в вводе игнорируются', () => {
    expect(matches(outcome, '147 600')).toBe(true)
    expect(matches(outcome, '147 600,5')).toBe(true)
  })

  test('запятая перед тремя цифрами — разделитель тысяч', () => {
    const tr = makeTr({ outcome: 1234 })
    expect(matches(tr, '1,234')).toBe(true)
    expect(matches(makeTr({ outcome: 1.234 }), '1,234')).toBe(false)
  })

  test('обе роли запятой в одной строке: 1,234,56 → 1234.56', () => {
    expect(matches(makeTr({ outcome: 1234.56 }), '1,234,56')).toBe(true)
    expect(matches(makeTr({ outcome: 123456 }), '1,234,56')).toBe(false)
  })

  test('одиночная точка всегда десятичная', () => {
    expect(matches(makeTr({ outcome: 1.234 }), '1.234')).toBe(true)
    expect(matches(makeTr({ outcome: 1234 }), '1.234')).toBe(false)
  })

  test('доход ищется так же, как расход', () => {
    expect(matches(makeTr({ income: 500 }), '500')).toBe(true)
  })

  test('сумма в валюте операции находится по opIncome/opOutcome', () => {
    const inEur = makeTr({ outcome: 2300, opOutcome: 25, opOutcomeInstrument: 3 })
    expect(matches(inEur, '25')).toBe(true)
    expect(matches(inEur, '2300')).toBe(true)
    const incomeInEur = makeTr({ income: 2300, opIncome: 25 })
    expect(matches(incomeInEur, '25')).toBe(true)
  })

  test('нечисловая строка не даёт совпадения по сумме', () => {
    expect(matches(makeTr({ outcome: 100 }), '100abc')).toBe(false)
    expect(matches(makeTr({ outcome: 100 }), '')).toBe(true) // пустой поиск = без фильтра
  })

  test('нулевая сумма не совпадает с поиском нуля', () => {
    expect(matches(makeTr({ outcome: 100 }), '0')).toBe(false)
  })
})

describe('checkRaw: поиск по тексту и мерчанту', () => {
  const merchants = { m1: makeMerchant('m1', 'Пятёрочка') }
  // Транзакция без сумм считается удалённой (isDeleted), поэтому во всех
  // текстовых кейсах сумма задана явно.
  const makeSpent = (patch: Partial<TTransaction> = {}) =>
    makeTr({ outcome: 100, ...patch })

  test('ищет по комментарию и плательщику без учёта регистра', () => {
    expect(matches(makeSpent({ comment: 'Обед в кафе' }), 'КАФЕ')).toBe(true)
    expect(matches(makeSpent({ payee: 'Lenta' }), 'lent')).toBe(true)
  })

  test('мерчант находится, когда проброшен ctx', () => {
    const tr = makeSpent({ merchant: 'm1' })
    expect(matches(tr, 'пятёроч', { merchants })).toBe(true)
  })

  test('без ctx мерчант не ищется', () => {
    const tr = makeSpent({ merchant: 'm1' })
    expect(matches(tr, 'пятёроч')).toBe(false)
  })

  test('транзакция без мерчанта не ломает поиск', () => {
    expect(matches(makeSpent({ comment: 'кафе' }), 'кафе', { merchants })).toBe(
      true
    )
    expect(matches(makeSpent(), 'кафе', { merchants })).toBe(false)
  })
})

describe('checkRaw: границы дат', () => {
  const tr = makeTr({ outcome: 100, date: '2026-01-15' })

  test('dateFrom и dateTo включительны', () => {
    expect(checkRaw({ dateFrom: '2026-01-15' })(tr)).toBe(true)
    expect(checkRaw({ dateTo: '2026-01-15' })(tr)).toBe(true)
  })

  test('за пределами диапазона не проходит', () => {
    expect(checkRaw({ dateFrom: '2026-01-16' })(tr)).toBe(false)
    expect(checkRaw({ dateTo: '2026-01-14' })(tr)).toBe(false)
  })

  test('обе границы вместе', () => {
    expect(checkRaw({ dateFrom: '2026-01-01', dateTo: '2026-01-31' })(tr)).toBe(
      true
    )
    expect(checkRaw({ dateFrom: '2026-02-01', dateTo: '2026-02-28' })(tr)).toBe(
      false
    )
  })

  test('пустая граница не фильтрует', () => {
    expect(checkRaw({ dateFrom: undefined, dateTo: undefined })(tr)).toBe(true)
  })

  test('Invalid Date в границу не попадает: NaN-строка отсекает всё', () => {
    // Защита из FilterDrawer не даёт такому значению уехать в условие;
    // тест фиксирует, что сам чекер на нём не притворяется успешным.
    const broken = 'NaN-NaN-NaN' as TTransaction['date']
    expect(checkRaw({ dateFrom: broken })(tr)).toBe(false)
  })
})
