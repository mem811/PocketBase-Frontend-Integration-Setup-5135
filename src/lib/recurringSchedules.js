import {pb} from './pocketbase';

const weekdays=['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
const weekdayNumbers=[1,2,3,4,5,6,0];
const fillsInProgress=new Map();

export function localDateKey(date=new Date()) {
  const year=date.getFullYear();
  const month=String(date.getMonth() + 1).padStart(2,'0');
  const day=String(date.getDate()).padStart(2,'0');
  return `${year}-${month}-${day}`;
}

export function dateKey(value) {
  return String(value || '').slice(0,10);
}

export function displayTime(value) {
  if (!value) return '';
  const [hour,minute]=value.split(':').map(Number);
  return new Date(2000,0,1,hour,minute).toLocaleTimeString('en-US',{hour: 'numeric',minute: '2-digit'});
}

export function slotConflicts(candidate,sessions,excludeId='') {
  const start=toMinutes(candidate.start);
  const end=toMinutes(candidate.end);
  return sessions.some((session)=> {
    if (session.id===excludeId || ['cancelled','no-show'].includes(session.status)) return false;
    const slot=session.expand?.slot || {};
    if (dateKey(slot.date)!==dateKey(candidate.date)) return false;
    return start<toMinutes(slot.end) && end>toMinutes(slot.start);
  });
}

function toMinutes(value='') {
  const [hours,minutes]=value.split(':').map(Number);
  return (hours || 0)*60+(minutes || 0);
}

function scheduleWeekday(value) {
  const normalized=String(value ?? '').trim().toLowerCase();
  if (/^[0-6]$/.test(normalized)) return Number(normalized);
  return weekdayNumbers[weekdays.indexOf(normalized)];
}

function weekdayForDate(value) {
  const [year,month,day]=dateKey(value).split('-').map(Number);
  return new Date(year,month-1,day,12).getDay();
}

function occurrenceDates(schedule,fromDate) {
  const today=localDateKey();
  const start=[today,dateKey(fromDate),dateKey(schedule.start_date)]
    .filter(Boolean)
    .sort()
    .at(-1);
  const horizonStart=new Date(`${start}T12:00:00`);
  const horizonEnd=new Date(horizonStart);
  horizonEnd.setDate(horizonEnd.getDate()+28);
  const limit=dateKey(schedule.end_date);
  const horizonEndKey=localDateKey(horizonEnd);
  const end=limit && limit<horizonEndKey ? limit : horizonEndKey;
  const targetDay=scheduleWeekday(schedule.weekday);
  const dates=[];

  for (let cursor=new Date(`${start}T12:00:00`);localDateKey(cursor)<=end;cursor.setDate(cursor.getDate()+1)) {
    if (cursor.getDay()===targetDay) dates.push(localDateKey(cursor));
  }
  return dates;
}

async function sessionsForSchedule(scheduleId) {
  return pb.collection('sessions').getFullList({filter: `schedule="${scheduleId}"`,expand: 'slot'});
}

export async function fillSchedule(schedule,fromDate) {
  if (!schedule?.active) return;
  if (fillsInProgress.has(schedule.id)) return fillsInProgress.get(schedule.id);
  const work=fillScheduleRecords(schedule,fromDate).finally(()=> fillsInProgress.delete(schedule.id));
  fillsInProgress.set(schedule.id,work);
  return work;
}

async function fillScheduleRecords(schedule,fromDate) {
  const normalized={
    ...schedule,
    weekday: String(schedule.weekday || '').trim().toLowerCase(),
    start: normalizeTime(schedule.start),
    end: normalizeTime(schedule.end)
  };
  const [sessions,packages]=await Promise.all([
    sessionsForSchedule(schedule.id),
    pb.collection('packages').getFullList({filter: `client="${schedule.client}" && status="active"`})
  ]);
  const dates=occurrenceDates(normalized,fromDate);
  const today=localDateKey();
  const targetDay=scheduleWeekday(normalized.weekday);
  const occupiedDates=new Set(sessions.map((session)=> dateKey(session.expand?.slot?.date)));
  const candidates=sessions
    .filter((session)=>session.status==='confirmed'
      && !session.moved
      && dateKey(session.expand?.slot?.date)>=today
      && weekdayForDate(session.expand?.slot?.date)!==targetDay)
    .sort((first,second)=>dateKey(first.expand?.slot?.date).localeCompare(dateKey(second.expand?.slot?.date)));
  const packageId=packages[0]?.id || '';

  for (const session of candidates) {
    const targetDate=dates.find((date)=>!occupiedDates.has(date));
    if (!targetDate) break;

    const newSlot=await pb.collection('availability').create({
      date: pocketBaseDate(targetDate),
      start: normalized.start,
      end: normalized.end,
      status: 'booked'
    });
    try {
      await pb.collection('sessions').update(session.id,{slot:newSlot.id});
      if (session.slot) {
        await pb.collection('availability').update(session.slot,{status:'open'}).catch(()=>{});
      }
      occupiedDates.add(targetDate);
    } catch (error) {
      await pb.collection('availability').delete(newSlot.id).catch(()=>{});
      throw error;
    }
  }

  for (const date of dates) {
    if (occupiedDates.has(date)) continue;
    const slot=await pb.collection('availability').create({
      date: pocketBaseDate(date),
      start: normalized.start,
      end: normalized.end,
      status: 'booked'
    });
    try {
      await pb.collection('sessions').create({
        client: normalized.client,
        ...(packageId ? {package: packageId} : {}),
        slot: slot.id,
        schedule: normalized.id,
        moved: false,
        status: 'confirmed',
        client_notes: '',
        trainer_notes: '',
        reminder_sent: false
      });
      occupiedDates.add(date);
    } catch (error) {
      await pb.collection('availability').delete(slot.id).catch(()=> {});
      throw error;
    }
  }
}

export async function fillAllActiveSchedules() {
  const schedules=await pb.collection('recurring_schedules').getFullList({filter: 'active=true'});
  await Promise.all(schedules.map((schedule)=> fillSchedule(schedule)));
}

export async function changeSchedule(schedule,changes,effectiveDate) {
  const existing=await sessionsForSchedule(schedule.id);
  const candidates=existing
    .filter((session)=> session.status==='confirmed' && !session.moved && dateKey(session.expand?.slot?.date)>=effectiveDate)
    .sort((first,second)=> dateKey(first.expand?.slot?.date).localeCompare(dateKey(second.expand?.slot?.date)));
  const candidateIds=new Set(candidates.map((session)=> session.id));
  const blockedDates=new Set(existing
    .filter((session)=> !candidateIds.has(session.id))
    .map((session)=> dateKey(session.expand?.slot?.date)));
  const updated=await pb.collection('recurring_schedules').update(schedule.id,{
    weekday: String(changes.weekday || '').trim().toLowerCase(),
    start: normalizeTime(changes.start),
    end: normalizeTime(changes.end),
    start_date: pocketBaseDate(effectiveDate)
  });
  const targetDates=occurrenceDates(updated,effectiveDate).filter((date)=> !blockedDates.has(date));

  for (let index=0;index<candidates.length;index+=1) {
    const session=candidates[index];
    const targetDate=targetDates[index];
    if (!targetDate) {
      await deleteSessionAndSlot(session);
      continue;
    }

    const newSlot=await pb.collection('availability').create({
      date: pocketBaseDate(targetDate),
      start: normalizeTime(updated.start),
      end: normalizeTime(updated.end),
      status: 'booked'
    });
    await pb.collection('sessions').update(session.id,{slot: newSlot.id});
    const oldSlotId=session.slot;
    if (oldSlotId && oldSlotId!==newSlot.id) {
      await pb.collection('availability').update(oldSlotId,{status: 'open'}).catch(()=> {});
    }
  }

  await fillSchedule(updated,effectiveDate);
  return updated;
}

export async function removeFutureScheduleSessions(scheduleId,fromDate) {
  const sessions=await sessionsForSchedule(scheduleId);
  const future=sessions.filter((session)=> session.status==='confirmed' && !session.moved && dateKey(session.expand?.slot?.date)>=fromDate);
  await Promise.all(future.map(deleteSessionAndSlot));
}

async function deleteSessionAndSlot(session) {
  await pb.collection('sessions').delete(session.id);
  if (session.slot) await pb.collection('availability').delete(session.slot).catch(()=> {});
}

function normalizeTime(value) {
  const match=String(value || '').trim().match(/^(\d{1,2}):([0-5]\d)$/);
  if (!match || Number(match[1])>23) throw new Error(`Invalid time value: ${value}`);
  return `${String(Number(match[1])).padStart(2,'0')}:${match[2]}`;
}

function pocketBaseDate(value) {
  return new Date(`${dateKey(value)}T00:00:00.000Z`).toISOString();
}

export {weekdays};
