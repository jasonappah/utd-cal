import { datetime, RRule, RRuleSet } from "rrule"
import { createEvents } from "ics"
import type {EventAttributes } from "ics"
import { myData } from "./me"
import { fall2023holidays } from "./data"

if (!myData) {
  console.error('No data found. Did you copy me.template.ts to me.ts and paste in your data?')
  process.exit(1)
}

const sections = myData.currentSections
const holidayRRuleset = new RRuleSet()

for (const holiday of fall2023holidays) {
  holidayRRuleset.exdate(datetime(...(holiday.date.split('-').map(Number) as [number, number, number])))
}

const rawDayToRRuleDay = {
  'M': RRule.MO,
  'T': RRule.TU,
  'W': RRule.WE,
  'R': RRule.TH,
  'F': RRule.FR,
  'S': RRule.SA,
  'U': RRule.SU
} as const

const isoToYMD = (iso: string) => {
  const [_, year, month, day] = iso.match(/(\d{4})-(\d{2})-(\d{2})/)
  return [year, month, day].map(Number) as [number, number, number]
}

const events = [] as EventAttributes[]

for (const section of sections) {
  // Skip math hw sections
  if (section.subject === "MATH" && (section.sectionNumber.startsWith('70'))) continue

  for (const meeting of section.meetings) {
    const dtstart = datetime(...isoToYMD(meeting.startDate))
    const end = datetime(...isoToYMD(meeting.endDate))
    const ruleset = holidayRRuleset.clone()
    const rule = new RRule({
      freq: RRule.WEEKLY,
      byweekday: meeting.daysRaw.split('').map(day => rawDayToRRuleDay[day]),
      dtstart,
      until: end
    })
    ruleset.rrule(rule)
    const day: [number,number,number] = [dtstart.getFullYear(), dtstart.getMonth()+1, dtstart.getDate()+1]
    events.push({
      title: `${section.subject} ${section.course} ${section.sectionNumber} - ${meeting.location}`,
      description: section.description,
      start: [...day, Math.floor(meeting.startTime / 100), meeting.startTime % 100],
      end: [...day,Math.floor(meeting.endTime / 100), meeting.endTime % 100],
      location: meeting.location,
      recurrenceRule: ruleset.toString(),
      productId: "jasonaa/utd-cal",
    })
  }
}

const {error, value} = createEvents(events)
if (value) {
  await Bun.write('utd.ics', value)
}

if (error) {
  console.error(error)
}
