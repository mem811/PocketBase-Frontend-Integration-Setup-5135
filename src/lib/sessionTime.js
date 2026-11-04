import {pb} from './pocketbase';
import {dateKey,slotConflicts} from './recurringSchedules';

function pocketBaseDate(value) {
  return new Date(`${value}T00:00:00.000Z`).toISOString();
}

export async function saveSessionTime(session,sessions,values) {
  const {date,start,end}=values;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error('Choose a valid session date.');
  }
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(start) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(end) || end<=start) {
    throw new Error('Choose valid 24-hour start and end times, with the end after the start.');
  }

  const target={date,start,end};
  if (slotConflicts(target,sessions,session.id)) {
    throw new Error('That time overlaps another booked session. Choose a different time.');
  }

  const currentSlot=session.expand?.slot;
  const sameSlot=currentSlot
    && dateKey(currentSlot.date)===date
    && currentSlot.start===start
    && currentSlot.end===end;

  if (sameSlot) return session;

  let slotId='';
  let createdSlot=null;
  let claimedSlot=null;

  if (session.slot && currentSlot) {
    await pb.collection('availability').update(session.slot,{
      date: pocketBaseDate(date),
      start,
      end,
      status: 'booked'
    });
    slotId=session.slot;
  } else {
    const openSlot=await pb.collection('availability').getFullList({
      filter: `status="open" && date="${pocketBaseDate(date)}" && start="${start}" && end="${end}"`
    });
    if (openSlot.length) {
      claimedSlot=openSlot[0];
      await pb.collection('availability').update(claimedSlot.id,{status: 'booked'});
      slotId=claimedSlot.id;
    } else {
      createdSlot=await pb.collection('availability').create({
        date: pocketBaseDate(date),
        start,
        end,
        status: 'booked'
      });
      slotId=createdSlot.id;
    }
  }

  try {
    const update={slot: slotId};
    if (session.schedule) update.moved=true;
    await pb.collection('sessions').update(session.id,update);
  } catch (error) {
    if (createdSlot) await pb.collection('availability').delete(createdSlot.id).catch(()=> {});
    if (claimedSlot) await pb.collection('availability').update(claimedSlot.id,{status: 'open'}).catch(()=> {});
    throw error;
  }

  if (session.slot && session.slot!==slotId) {
    const usedElsewhere=sessions.some((row)=> row.id!==session.id
      && row.slot===session.slot
      && !['cancelled','no-show'].includes(row.status));
    if (!usedElsewhere) {
      await pb.collection('availability').update(session.slot,{status: 'open'}).catch(()=> {});
    }
  }
  return {slot: slotId};
}
