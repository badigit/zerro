import type {
  TAccountId,
  TISODate,
  TISOMonth,
  TMerchant,
  TTagId,
  TTransaction,
} from '6-shared/types'
import type { ValueCondition, StringCondition } from './basicFiltering'

import { keys } from '6-shared/helpers/keys'
import { toISOMonth } from '6-shared/helpers/date'

import { getType, isDeleted, isViewed, TrType } from './helpers'
import { checkValue } from './basicFiltering'

type BasicConditions = {
  [key in keyof TTransaction]?: ValueCondition
}

type AdditionalConditions = {
  search?: null | string
  type?: StringCondition<TrType>
  showDeleted?: boolean
  isViewed?: boolean
  /**
   * Custom filtering condition for tags.
   * When it's used all transfers and debts are excluded from the result.
   */
  tags?: null | TTagId[] // Special case: null means "no tags"
  mainTag?: StringCondition<TTagId>
  month?: StringCondition<TISOMonth>
  account?: StringCondition<TAccountId>
  amount?: ValueCondition
  dateFrom?: TISODate
  dateTo?: TISODate
}

export type TrCondition = BasicConditions &
  AdditionalConditions & {
    or?: TrCondition[]
    and?: TrCondition[]
  }

/**
 * Extra lookups the checker needs to resolve references (e.g. merchant id →
 * title) that are not stored directly on the transaction.
 */
export type CheckContext = {
  merchants?: Record<string, TMerchant>
}

export const checkRaw =
  (conditions?: TrCondition, ctx?: CheckContext) =>
  (tr: TTransaction): boolean =>
    checkConditions(tr, conditions, ctx)

function checkConditions(
  tr: TTransaction,
  conditions?: TrCondition,
  ctx?: CheckContext
): boolean {
  // Check if transaction is deleted even if it's not specified in conditions
  // (usually we don't want deleted transactions)
  if (!checkDeleted(tr, conditions?.showDeleted)) return false
  // No conditions - return true
  if (!conditions) return true
  // Now check all other conditions
  return keys(conditions).every(key => checkKey(key, tr, conditions, ctx))
}

/**
 * Checks if a transaction matches a given condition.
 * @param key key of the condition
 * @param tr transaction
 * @param conditions object with conditions
 * @param ctx extra lookups (merchants, etc.)
 */
function checkKey(
  key: keyof TrCondition,
  tr: TTransaction,
  conditions?: TrCondition,
  ctx?: CheckContext
): boolean {
  if (!conditions || conditions[key] === undefined) return true

  switch (key) {
    /* Handle custom conditions */
    case 'search':
      return checkSearch(tr, conditions[key], ctx)
    case 'type':
      return checkType(tr, conditions[key])
    case 'showDeleted':
      return checkDeleted(tr, conditions[key])
    case 'isViewed':
      return checkIsViewed(tr, conditions[key])
    case 'tags':
      return checkTags(tr, conditions[key])
    case 'mainTag':
      return checkMainTag(tr, conditions[key])
    case 'month':
      return checkMonth(tr, conditions[key])
    case 'account':
      return checkAccount(tr, conditions[key])
    case 'amount':
      return checkAmount(tr, conditions[key])
    case 'dateFrom':
      return checkDateFrom(tr, conditions[key])
    case 'dateTo':
      return checkDateTo(tr, conditions[key])

    /* Handle logical operators */
    case 'or':
      return (
        conditions.or?.some(condition =>
          checkConditions(tr, condition, ctx)
        ) ?? true
      )
    case 'and':
      return (
        conditions.and?.every(condition =>
          checkConditions(tr, condition, ctx)
        ) ?? true
      )

    /* Handle basic conditions */
    default:
      if (key in tr) {
        return checkValue(tr[key], conditions[key])
      } else {
        throw new Error('Unknown filtering field: ' + key)
      }
  }
}

// Custom condition handlers

function checkSearch(
  tr: TTransaction,
  condition?: TrCondition['search'],
  ctx?: CheckContext
) {
  if (!condition) return true
  const { upperCondition, amount } = parseSearchQuery(condition)
  // In the list the displayed name is the merchant title when a merchant is
  // set, otherwise the payee. Search has to look at both so it matches what
  // the user actually sees.
  const merchantTitle = tr.merchant
    ? ctx?.merchants?.[tr.merchant]?.title
    : undefined
  const textMatch =
    tr.comment?.toUpperCase().includes(upperCondition) ||
    tr.payee?.toUpperCase().includes(upperCondition) ||
    merchantTitle?.toUpperCase().includes(upperCondition)
  if (textMatch) return true
  return checkAmountSearch(tr, amount)
}

type TAmountQuery = {
  value: number
  /** Fractional input requires an exact match, integer input matches by whole units */
  hasFraction: boolean
}

type TSearchQuery = {
  upperCondition: string
  amount: TAmountQuery | null
}

/**
 * Разбор строки поиска считается один раз на прогон, а не на каждую транзакцию:
 * условие поиска в рамках одного прогона всегда одно и то же, а список
 * транзакций — десятки тысяч.
 */
let searchQueryCache: { raw: string; query: TSearchQuery } | undefined

function parseSearchQuery(raw: string): TSearchQuery {
  if (searchQueryCache?.raw === raw) return searchQueryCache.query
  const query: TSearchQuery = {
    upperCondition: raw.toUpperCase(),
    amount: parseAmountQuery(raw),
  }
  searchQueryCache = { raw, query }
  return query
}

/**
 * Parses the search string as an amount. Spaces (including NBSP) are treated as
 * thousands separators and ignored. Both `.` and `,` can separate thousands or
 * the fraction, so the last separator decides:
 *
 * - `1,234` / `1 234` → 1234 (three digits after the separator = thousands)
 * - `1,234,56` / `1 234,56` → 1234.56
 * - `147600.5` → fractional (a lone dot is always a decimal point)
 * - Anything that is not a number → null, the amount check is skipped.
 */
function parseAmountQuery(raw: string): TAmountQuery | null {
  const compact = raw.trim().replace(/[\s ]/g, '')
  if (!/^\d[\d.,]*$/.test(compact)) return null

  const lastSeparator = Math.max(
    compact.lastIndexOf('.'),
    compact.lastIndexOf(',')
  )
  if (lastSeparator === -1) {
    const value = Number(compact)
    return Number.isFinite(value) ? { value, hasFraction: false } : null
  }

  const tail = compact.slice(lastSeparator + 1)
  const separatorCount = compact.replace(/\d/g, '').length
  const isDecimalPoint =
    tail.length === 0
      ? false
      : separatorCount === 1 && compact[lastSeparator] === '.'
        ? true
        : tail.length <= 2

  const digitsOnly = (s: string) => s.replace(/[.,]/g, '')
  const normalized = isDecimalPoint
    ? digitsOnly(compact.slice(0, lastSeparator)) + '.' + tail
    : digitsOnly(compact)

  const value = Number(normalized)
  if (!Number.isFinite(value)) return null
  return { value, hasFraction: isDecimalPoint }
}

/**
 * Matches the parsed amount against transaction amounts. Original amounts
 * (opIncome/opOutcome) are checked too: the list shows 25 EUR while the
 * transaction stores 2300 RUB, and searching for 25 has to find it.
 */
function checkAmountSearch(tr: TTransaction, query: TAmountQuery | null) {
  if (!query) return false
  const { value, hasFraction } = query
  return [tr.income, tr.outcome, tr.opIncome, tr.opOutcome].some(amount => {
    if (!amount) return false
    return hasFraction
      ? Math.abs(amount - value) < 1e-6
      : Math.floor(amount) === value
  })
}

function checkType(tr: TTransaction, condition?: TrCondition['type']) {
  return checkValue(getType(tr), condition)
}

function checkDeleted(
  tr: TTransaction,
  condition?: TrCondition['showDeleted']
) {
  if (isDeleted(tr)) return Boolean(condition)
  return true
}

function checkIsViewed(tr: TTransaction, condition?: TrCondition['isViewed']) {
  if (condition === undefined) return true
  return isViewed(tr) === condition
}

function checkTags(tr: TTransaction, condition?: TrCondition['tags']) {
  if (!condition || condition.length === 0) return true
  // At this point there is a condition
  // That means that only income or outcome transactions can match
  const trType = getType(tr)
  if (trType !== TrType.Income && trType !== TrType.Outcome) return false

  // Otherwise check if any of the tags in condition match transaction tags
  return condition.some(tagId => {
    if (tagId === 'null') {
      // Special case: null means "no tags"
      return tr.tag === null || tr.tag.length === 0
    }
    return tr.tag?.includes(tagId)
  })
}

function checkMainTag(tr: TTransaction, condition?: TrCondition['mainTag']) {
  const mainTag = tr.tag?.[0] || null
  return checkValue(mainTag, condition)
}

function checkMonth(tr: TTransaction, condition?: TrCondition['month']) {
  return checkValue(toISOMonth(tr.date), condition)
}

function checkAccount(tr: TTransaction, condition?: TrCondition['account']) {
  return (
    checkValue(tr.incomeAccount, condition) ||
    checkValue(tr.outcomeAccount, condition)
  )
}

function checkAmount(tr: TTransaction, condition?: TrCondition['amount']) {
  const type = getType(tr)
  if (type === TrType.Income) return checkValue(tr.income, condition)
  if (type === TrType.Outcome) return checkValue(tr.outcome, condition)
  return checkValue(tr.income, condition) || checkValue(tr.outcome, condition)
}

function checkDateFrom(tr: TTransaction, condition?: TrCondition['dateFrom']) {
  if (!condition) return true
  return tr.date >= condition
}

function checkDateTo(tr: TTransaction, condition?: TrCondition['dateTo']) {
  if (!condition) return true
  return tr.date <= condition
}
