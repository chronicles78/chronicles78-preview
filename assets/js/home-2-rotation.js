/* Fixed editorial roster: changes ship on a Monday, not on each archive update.
   All six stories were ready and had associated media on 2026-10-06. */
(function(root){
  const epoch=Date.UTC(2026,9,5);
  const stories=Object.freeze(["S-000","S-001","S-002","S-011","S-012","S-051"]);
  const faces=Object.freeze(["10A-04","10A-24","10A-27"]);
  function monday(now=new Date()){
    const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Samara",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(now);
    const get=t=>Number(parts.find(p=>p.type===t).value);
    const day=new Date(Date.UTC(get("year"),get("month")-1,get("day")));
    day.setUTCDate(day.getUTCDate()-(day.getUTCDay()+6)%7);
    return day.getTime();
  }
  function select(now=new Date()){
    const week=Math.floor((monday(now)-epoch)/604800000);
    const slot=n=>((week%n)+n)%n;
    return {week,weekStart:new Date(monday(now)).toISOString().slice(0,10),storyId:stories[slot(stories.length)],personId:faces[slot(faces.length)]};
  }
  root.ChroniclesHome2Rotation=Object.freeze({monday,select,stories,faces});
})(typeof window!=="undefined"?window:globalThis);
