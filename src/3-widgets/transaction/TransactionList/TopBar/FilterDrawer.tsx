import React, { FC, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Drawer,
  Box,
  TextField,
  FormControlLabel,
  MenuItem,
  Switch,
  Grid,
  Typography,
  Button,
  IconButton,
  SelectChangeEvent,
  FormControl,
  InputLabel,
  Autocomplete,
} from '@mui/material'
import { DatePicker } from '@mui/x-date-pickers'
import { Tooltip } from '6-shared/ui/Tooltip'
import { CloseIcon } from '6-shared/ui/Icons'
import { SmartSelect } from '6-shared/ui/SmartSelect'
import { parseDate, toISODate } from '6-shared/helpers/date'
import { TagSelect } from '5-entities/tag/ui/TagSelect'
import { accountModel } from '5-entities/account'
import { TrCondition } from '5-entities/transaction'
import { TrType } from '5-entities/transaction'

const drawerWidth = { xs: '100vw', sm: 360 }
const contentSx = {
  width: drawerWidth,
  [`& .MuiDrawer-paper`]: { width: drawerWidth },
}

type FilterDrawerProps = {
  setCondition: (c: TrCondition) => void
  conditions: TrCondition
  clearFilter: () => void
  onClose: () => void
  open: boolean
}

const FilterDrawer: FC<FilterDrawerProps> = ({
  conditions = {},
  setCondition,
  clearFilter,
  onClose,
  open,
  ...rest
}) => {
  const { t } = useTranslation('filterDrawer')
  const populatedAccounts = accountModel.usePopulatedAccounts()

  const accountOptions = useMemo(
    () =>
      Object.values(populatedAccounts)
        .filter(a => !a.archive)
        .sort((a, b) => a.title.localeCompare(b.title)),
    [populatedAccounts]
  )

  const selectedAccountIds = useMemo(() => {
    const cond = conditions.account
    if (!cond) return []
    if (typeof cond === 'string') return [cond]
    if (typeof cond === 'object' && cond !== null && 'in' in cond && cond.in)
      return cond.in as string[]
    return []
  }, [conditions.account])

  const handleTypeChange = (e: SelectChangeEvent<string>) => {
    const value = e.target.value as TrType
    setCondition({ type: value || undefined })
  }

  const { gte, lte } = getGteLte(conditions.amount)

  return (
    <Drawer
      anchor="right"
      onClose={onClose}
      open={open}
      sx={contentSx}
      {...rest}
    >
      <Box sx={{ py: 1, px: 2, display: 'flex', alignItems: 'center' }}>
        <Box sx={{ flexGrow: 1 }}>
          <Typography variant="h6" noWrap>
            {t('filter')}
          </Typography>
        </Box>

        <Tooltip title={t('close')}>
          <IconButton edge="end" onClick={onClose} children={<CloseIcon />} />
        </Tooltip>
      </Box>
      <Box sx={{ px: 2, flex: '1', display: 'flex', flexDirection: 'column' }}>
        <TextField
          id="search-input"
          label={t('searchComments')}
          value={conditions.search || ''}
          onChange={e => setCondition({ search: e.target.value })}
          variant="outlined"
          fullWidth
        />

        <Box sx={{ mt: 3, display: 'flex' }}>
          <Grid container spacing={3}>
            <Grid size={6}>
              <TextField
                variant="outlined"
                label={t('amountFrom')}
                value={gte || ''}
                onChange={e => {
                  const value = e.target.value ? +e.target.value : undefined
                  setCondition({ amount: { lte, gte: value } })
                }}
              />
            </Grid>
            <Grid size={6}>
              <TextField
                variant="outlined"
                label={t('amountTo')}
                value={lte || ''}
                onChange={e => {
                  const value = e.target.value ? +e.target.value : undefined
                  setCondition({ amount: { gte, lte: value } })
                }}
              />
            </Grid>
          </Grid>
        </Box>

        <Box sx={{ mt: 3, display: 'flex' }}>
          <Grid container spacing={3}>
            <Grid size={6}>
              <DatePicker
                label={t('dateFrom')}
                value={conditions.dateFrom ? parseDate(conditions.dateFrom) : null}
                onChange={date =>
                  setCondition({
                    dateFrom: date ? toISODate(date) : undefined,
                  })
                }
                format="dd.MM.yyyy"
                slotProps={{ textField: { variant: 'outlined', fullWidth: true } }}
              />
            </Grid>
            <Grid size={6}>
              <DatePicker
                label={t('dateTo')}
                value={conditions.dateTo ? parseDate(conditions.dateTo) : null}
                onChange={date =>
                  setCondition({
                    dateTo: date ? toISODate(date) : undefined,
                  })
                }
                format="dd.MM.yyyy"
                slotProps={{ textField: { variant: 'outlined', fullWidth: true } }}
              />
            </Grid>
          </Grid>
        </Box>
        <Box sx={{ mt: 3 }}>
          <FormControl fullWidth>
            <InputLabel>{t('transactionType')}</InputLabel>
            <SmartSelect
              elKey="transactionType"
              variant="outlined"
              value={typeof conditions.type === 'string' ? conditions.type : ''}
              onChange={handleTypeChange}
              label={t('transactionType')}
              fullWidth
            >
              <MenuItem value="">{t('transactionType_all')}</MenuItem>
              <MenuItem value={TrType.Income}>
                {t('transactionType_income')}
              </MenuItem>
              <MenuItem value={TrType.Outcome}>
                {t('transactionType_outcome')}
              </MenuItem>
              <MenuItem value={TrType.Transfer}>
                {t('transactionType_transfer')}
              </MenuItem>
            </SmartSelect>
          </FormControl>
        </Box>

        <Box sx={{ mt: 3 }}>
          <TagSelect
            multiple
            tagFilters={{ includeNull: true }}
            value={conditions.tags || []}
            onChange={tags =>
              setCondition({ tags: tags as TrCondition['tags'] })
            }
            label={t('categories')}
          />
        </Box>

        <Box sx={{ mt: 3 }}>
          <Autocomplete
            multiple
            options={accountOptions}
            getOptionLabel={option => option.title}
            isOptionEqualToValue={(option, value) => option.id === value.id}
            value={accountOptions.filter(a =>
              selectedAccountIds.includes(a.id)
            )}
            onChange={(_e, value) => {
              const ids = value.map(a => a.id)
              setCondition({
                account: ids.length ? { in: ids } : undefined,
              })
            }}
            renderInput={params => (
              <TextField {...params} label={t('accounts')} variant="outlined" />
            )}
          />
        </Box>

        <Box sx={{ mt: 3 }}>
          <FormControlLabel
            label={t('onlyNew')}
            control={
              <Switch
                color="primary"
                checked={conditions.isViewed === false}
                onChange={e => {
                  if (e.target.checked) setCondition({ isViewed: false })
                  else setCondition({ isViewed: undefined })
                }}
              />
            }
          />
        </Box>

        <Box sx={{ mt: 3 }}>
          <FormControlLabel
            label={t('showDeleted')}
            control={
              <Switch
                checked={Boolean(conditions.showDeleted)}
                onChange={e =>
                  setCondition({ showDeleted: e.target.checked || undefined })
                }
                color="primary"
              />
            }
          />
        </Box>
        <Box sx={{ mt: 'auto', mb: 3 }}>
          <Button
            onClick={clearFilter}
            variant="contained"
            fullWidth
            color="primary"
          >
            {t('clearFilter')}
          </Button>
        </Box>
      </Box>
    </Drawer>
  )
}

export default FilterDrawer

function getGteLte(amount: TrCondition['amount']) {
  if (amount === undefined || amount === null)
    return { gte: undefined, lte: undefined }
  if (typeof amount === 'number') return { gte: amount, lte: amount }
  if (typeof amount === 'object')
    return {
      gte: amount.gte === undefined ? undefined : +amount.gte,
      lte: amount.lte === undefined ? undefined : +amount.lte,
    }
  return { gte: undefined, lte: undefined }
}
