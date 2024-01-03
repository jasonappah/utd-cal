import { datetime, RRule, RRuleSet } from "rrule"
import { createEvents } from "ics"
import type { DateArray, EventAttributes } from "ics"
import { myData } from "./me"
import { currentHolidays, UTD_TIMEZONE } from "./data"
import { getGitCommitHash } from './getGitCommitHash' with { type: 'macro' };
import * as tz from '@touch4it/ical-timezones'

if (!myData) {
  console.error('No data found. Did you copy me.template.ts to me.ts and paste in your data?')
  process.exit(1)
}

const sections = myData.currentSections

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

const vtimezone = tz.getVtimezoneComponent(UTD_TIMEZONE)
if (!vtimezone) {
  console.error('No timezone found')
  process.exit(1)
}

for (const section of sections) {
  // Skip exam/hw sections
  if ((section.subject === "MATH" || section.subject === "PHYS") && (section.sectionNumber.startsWith('70'))) continue

  for (const meeting of section.meetings) {
    const startHr = Math.floor(meeting.startTime / 100)
    const startMin = meeting.startTime % 100
    const startArgs: DateArray = [...isoToYMD(meeting.startDate), startHr, startMin]
    const endArgs: DateArray = [...isoToYMD(meeting.endDate), Math.floor(meeting.endTime / 100), meeting.endTime % 100]

    const ruleSet = new RRuleSet()

    const meetingRecurrenceRule = new RRule({
      freq: RRule.WEEKLY,
      byweekday: Array.from(meeting.daysRaw).map(day => rawDayToRRuleDay[day]),
      dtstart: datetime(...startArgs),
      tzid: UTD_TIMEZONE,
      until: datetime(...endArgs)
    })

    ruleSet.rrule(meetingRecurrenceRule)
    // for (const holiday of currentHolidays) {
    //   const d = datetime(...isoToYMD(holiday.date), startHr, startMin)
    //   ruleSet.exdate(d)
    // }

    // console.log(section.subject, section.course, meeting.startTime, ruleSet.all())
    // console.log(ruleSet.toString())
    const r = ruleSet.toString().split("\n").reverse().join("\n").replace("RRULE:", "")

    events.push({
      title: `${section.subject} ${section.course} ${section.sectionNumber} - ${meeting.location}`,
      start: startArgs,
      end: endArgs,
      location: meeting.location,
      recurrenceRule: r,
      productId: `jasonaa/utd-cal-${getGitCommitHash()}`,
      // @ts-ignore
      exclusionDates: currentHolidays.map(h => isoToYMD(h.date))
    })
  }
}

const {error, value: og} = createEvents(events)
if (og) {
  const value = og.replace('BEGIN:VEVENT', `${vtimezone}BEGIN:VEVENT`)
  .replaceAll("\\n", "\r\n")
  .replaceAll("\r\n\t", "")
  const fileName = `utd.ics`
  await Bun.write(fileName, value)
  console.log('Wrote', fileName)
}

if (error) {
  console.error(error)
}
