import {pb} from './pocketbase';

function localDateKey(date=new Date()){
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}

function recordDate(value){
  return String(value||'').slice(0,10);
}

async function records(collection,filter,options={}){
  return pb.collection(collection).getFullList({filter,...options});
}

export async function archiveClient(client){
  const [schedules,sessions]=await Promise.all([
    records('recurring_schedules',`client="${client.id}"`),
    records('sessions',`client="${client.id}"`,{expand:'slot'})
  ]);

  for(const schedule of schedules){
    if(schedule.active) await pb.collection('recurring_schedules').update(schedule.id,{active:false});
  }

  const futureSessions=sessions.filter((session)=>{
    const date=recordDate(session.expand?.slot?.date);
    return session.status!=='completed'&&date&&date>=localDateKey();
  });
  const slotIds=[...new Set(futureSessions.map((session)=>session.slot).filter(Boolean))];

  for(const session of futureSessions){
    await pb.collection('sessions').delete(session.id);
  }

  for(const slotId of slotIds){
    const remaining=await records('sessions',`slot="${slotId}"`);
    const stillBooked=remaining.some((session)=>!['cancelled','no-show'].includes(session.status));
    if(!stillBooked) await pb.collection('availability').update(slotId,{status:'open'});
  }

  await pb.collection('clients').update(client.id,{active:false});
}

export async function permanentlyDeleteClient(client){
  const [workouts,payments,sessions,schedules,packages,notes]=await Promise.all([
    records('workouts',`client="${client.id}"`),
    records('payments',`client="${client.id}"`),
    records('sessions',`client="${client.id}"`),
    records('recurring_schedules',`client="${client.id}"`),
    records('packages',`client="${client.id}"`),
    records('trainer_private_notes',`client="${client.id}"`)
  ]);
  const slotIds=[...new Set(sessions.map((session)=>session.slot).filter(Boolean))];

  for(const workout of workouts) await pb.collection('workouts').delete(workout.id);
  for(const payment of payments) await pb.collection('payments').delete(payment.id);
  for(const session of sessions) await pb.collection('sessions').delete(session.id);

  for(const slotId of slotIds){
    const remaining=await records('sessions',`slot="${slotId}"`);
    if(!remaining.length) await pb.collection('availability').delete(slotId);
  }

  for(const schedule of schedules) await pb.collection('recurring_schedules').delete(schedule.id);
  for(const item of packages) await pb.collection('packages').delete(item.id);
  for(const note of notes) await pb.collection('trainer_private_notes').delete(note.id);
  await pb.collection('clients').delete(client.id);
  if(client.user) await pb.collection('users').delete(client.user);
}
