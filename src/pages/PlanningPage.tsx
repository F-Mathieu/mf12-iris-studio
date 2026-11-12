import { useState } from 'react';
import { Card, Empty, Loading, PageHeader, Select, useAsync } from '../components/ui';
import { Planning } from '../components/Planning';
import { getSession, listSessions } from '../services/sessions';
import { listRegistrations } from '../services/registrations';
import { fmtLongDate } from '../lib/format';

export default function PlanningPage() {
  const sessions = useAsync(() => listSessions(), []);
  const [sid, setSid] = useState('');
  const current = sid || sessions.data?.find((s) => s.status === 'active')?.id || sessions.data?.[0]?.id || '';
  const s = useAsync(() => (current ? getSession(current) : Promise.resolve(null)), [current]);
  const regs = useAsync(() => (current ? listRegistrations(current) : Promise.resolve([])), [current]);
  return (
    <>
      <PageHeader title="Planning" subtitle={s.data ? fmtLongDate(s.data.date) : 'Rendez-vous des séances'}
        actions={<Select className="w-72" value={current} onChange={(e) => setSid(e.target.value)}>{sessions.data?.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select>} />
      {!sessions.data ? <Loading /> : !current ? <Card><Empty title="Aucune séance" text="Créez une séance pour organiser les rendez-vous." /></Card>
        : s.data && regs.data ? <Planning session={s.data} regs={regs.data} reload={regs.reload} /> : <Loading />}
    </>
  );
}
