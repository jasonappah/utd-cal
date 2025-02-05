import { datetime, RRule } from "rrule"
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

const vtimezone = tz.getVtimezoneComponent(UTD_TIMEZONE)
if (!vtimezone) {
  console.error(`No timezone found for timezone: ${UTD_TIMEZONE}.`)
  process.exit(1)
}

const REMOVE_LINE = "__REMOVE_LINE__" as const
const REMOVE_LINE_REGEX = new RegExp(`^.*(${REMOVE_LINE}).*$`, "gm")
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
const pad = (n: number) => n < 10 ? `0${n}` : `${n}`

for (const section of sections) {
  // Skip exam/hw sections
  if ((section.subject === "MATH" || section.subject === "PHYS") && (section.sectionNumber.startsWith('70'))) continue

  for (const meeting of section.meetings) {
    const startHr = Math.floor(meeting.startTime / 100)
    const startMin = meeting.startTime % 100
    const startDateISO = isoToYMD(meeting.startDate)
    const startArgs: DateArray = [...startDateISO, startHr, startMin]
    const endHr = Math.floor(meeting.endTime / 100)
    const endMin = meeting.endTime % 100

    const meetingRecurrenceRule = new RRule({
      freq: RRule.WEEKLY,
      byweekday: Array.from(meeting.daysRaw).map(day => rawDayToRRuleDay[day]),
      dtstart: datetime(...startArgs),
      tzid: UTD_TIMEZONE,
      until: datetime(...isoToYMD(meeting.endDate), endHr, endMin)
    })

    // When stringified, the ruleset specifies the RRULE and DTSTART;TZID on separate lines. When we pass the RRULE to ics, it already adds the RRULE: prefix, so we need to remove it to ensure the event is parsed correctly.
    const r = meetingRecurrenceRule.toString().split("\n").reverse().join("\n").replace("RRULE:", "")

    const dtstart = r.match(/DTSTART;TZID=.*:(.*)/)?.[1]

    events.push({
      title: `${section.subject} ${section.course} ${section.sectionNumber} - ${meeting.location}`,
      // The RRULE includes a DTSTART with a floating time and TZID directive, so we don't want to use this DTSTART since the ICS library defaults to using UTC and we can't specify any other timezone here. However, the ICS library won't allow event creation to continue if we omit the start property, so we'll just remove this line in the ics file once it's generated.
      start: REMOVE_LINE,
      duration: { hours: endHr - startHr, minutes: endMin - startMin },
      location: meeting.location,
      recurrenceRule: r,
      productId: `jasonaa/utd-cal-${getGitCommitHash()}`,

      // 8 is the number of characters in the date string (YYYYMMDD)
      exclusionDates: currentHolidays.map(h => {
        const [year, month, day] = isoToYMD(h.date)
        return dtstart.replace(/^\d{8}/g,`${year}${pad(month)}${pad(day)}`)}
      )
    })
  }
}

const {error, value: og} = createEvents(events)
if (og) {
  const value = og.replace('BEGIN:VEVENT', `${vtimezone}BEGIN:VEVENT`)
  // Ensures RRULE and DTSTART;TZID are on separate lines.
  // The ICS library tries to 'help' us by escaping any new lines in the RRULE, but this means that the event doesn't validate correctly.
  .replaceAll("\\n", "\r\n")
  // Because the RRULE and DTSTART;TZID are the on the same line, the length exceeds the 75 character limit in the RFC spec, so the ICS library wraps it onto a new line, which ends up splitting the TZID directive onto 2 lines. After the previous replacement, the 2 directives should now begin on separate lines, so we can safely 'unwrap' the TZID line without exceeding the 75 character limit.
  .replaceAll("\r\n\t", "")
  // Removes the extraneous DTSTART line
  .replaceAll(REMOVE_LINE_REGEX, "")
  // Adds the TZID directive to the EXDATE lines
  .replaceAll("EXDATE:", `EXDATE;TZID=${UTD_TIMEZONE}:`)
  const fileName = `utd.ics`
  await Bun.write(fileName, value)
  console.log('Wrote', fileName)
}

if (error) {
  console.error(error)
}
