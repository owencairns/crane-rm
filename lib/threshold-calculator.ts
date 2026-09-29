import { getThreshold } from "@/lib/dual-wage-thresholds"

/** Full-time equivalent hours in a year: 40 hours x 52 weeks. */
export const ANNUAL_HOURS = 2080

export interface EmployeeInput {
  id: string
  name: string
  classCode: string
  /** Current hourly wage, dollars. */
  currentWage: number
  /** Net work comp rate per $100 of payroll at or above the threshold. */
  overRate: number
  /** Net work comp rate per $100 of payroll below the threshold. */
  underRate: number
}

export interface EmployeeResult {
  id: string
  name: string
  classCode: string
  threshold: number
  /** True when the employee already rates at the cheaper "over" rate. */
  alreadyOver: boolean
  currentWage: number
  /** Wage they would need to reach, which is the threshold itself. */
  targetWage: number
  raisePerHour: number
  currentAnnualWages: number
  newAnnualWages: number
  /** Extra payroll the raise costs over a year. */
  wageIncreaseCost: number
  currentWorkComp: number
  newWorkComp: number
  /** Work comp premium avoided by moving to the over rate. */
  workCompSavings: number
  /** What the raise actually nets out to: savings minus the raise. */
  netSavings: number
  worthIt: boolean
}

/**
 * Works out whether raising an employee to the dual wage threshold pays for
 * itself. Below the threshold the employee rates at the expensive "under"
 * rate; at or above it they rate at the cheaper "over" rate. Because work
 * comp is priced per $100 of payroll, a small raise can cut the premium by
 * more than the raise costs.
 */
export function calculateEmployee(
  input: EmployeeInput,
  policyEffectiveDate: string
): EmployeeResult | null {
  const threshold = getThreshold(input.classCode, policyEffectiveDate)
  if (threshold === null) return null

  const alreadyOver = input.currentWage >= threshold
  const targetWage = alreadyOver ? input.currentWage : threshold
  const raisePerHour = targetWage - input.currentWage

  const currentAnnualWages = input.currentWage * ANNUAL_HOURS
  const newAnnualWages = targetWage * ANNUAL_HOURS
  const wageIncreaseCost = newAnnualWages - currentAnnualWages

  // Work comp is quoted per $100 of payroll, so divide payroll by 100 first.
  const currentRate = alreadyOver ? input.overRate : input.underRate
  const currentWorkComp = (currentAnnualWages / 100) * currentRate
  const newWorkComp = (newAnnualWages / 100) * input.overRate
  const workCompSavings = currentWorkComp - newWorkComp

  const netSavings = workCompSavings - wageIncreaseCost

  return {
    id: input.id,
    name: input.name,
    classCode: input.classCode,
    threshold,
    alreadyOver,
    currentWage: input.currentWage,
    targetWage,
    raisePerHour,
    currentAnnualWages,
    newAnnualWages,
    wageIncreaseCost,
    currentWorkComp,
    newWorkComp,
    workCompSavings,
    netSavings,
    worthIt: !alreadyOver && netSavings > 0,
  }
}

export function money(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  })
}

export function moneyPrecise(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}
