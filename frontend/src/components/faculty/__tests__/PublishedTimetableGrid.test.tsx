import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PublishedTimetableGrid, timetableBoundaries } from '../PublishedTimetableGrid';
const slot = { timetable_id:'one',day_of_week:2,start_time:'13:30:00',end_time:'16:50:00',course_code:'BP307P',course_name:'Microbiology Practical',room:'LT-28',section:'BATCH-C' };
describe('Exact published timetable grid', () => {
  it('never hides a 1:30 class beneath an invented lunch row', () => {
    render(<PublishedTimetableGrid slots={[slot]} />);
    expect(screen.getByText('1:30 PM – 4:50 PM')).toBeInTheDocument();
    expect(screen.getByText('BATCH-C · LT-28')).toBeInTheDocument();
    expect(screen.queryByText('Lunch break')).not.toBeInTheDocument();
  });
  it('retains exact fifty and sixty minute boundaries without empty hour rows', () => {
    const lecture={...slot,timetable_id:'two',start_time:'10:00',end_time:'10:50',course_code:'BP303T'};
    const first={...lecture,timetable_id:'three',start_time:'09:00',end_time:'10:00'};
    expect(timetableBoundaries([slot,lecture,first])).toEqual([540,600,650,810,1010]);
    const {container}=render(<PublishedTimetableGrid slots={[slot,{...lecture,day_of_week:1,start_time:'14:20',end_time:'15:10'}]} />);
    expect(container.querySelectorAll('button[aria-pressed]')).toHaveLength(2);
    expect(container.querySelector('table')).toBeNull();
  });
  it('shows dated changes and class types with distinct colors on one time axis', () => {
    render(<PublishedTimetableGrid slots={[
      { ...slot, timetable_id: 'practical', display_status: 'PRACTICAL' },
      { ...slot, timetable_id: 'extra', day_of_week: 3, display_status: 'EXTRA_CLASS' },
      { ...slot, timetable_id: 'cancelled', day_of_week: 4, display_status: 'CANCELLED' },
    ]} weekStart={new Date(2026,9,26)} />);
    expect(screen.getByRole('button', { name: /cancelled/i })).toHaveClass('bg-rose-50');
    expect(screen.getByText('Extra · BP307P').closest('button')).toHaveClass('bg-amber-50');
    expect(screen.getAllByRole('button', { name: /Microbiology Practical/i })[0]).toHaveClass('bg-emerald-50');
    expect(screen.getByLabelText('Mon')).toBeInTheDocument();
  });
  it('does not drop simultaneous batches', () => {
    render(<PublishedTimetableGrid slots={[slot,{...slot,timetable_id:'other',section:'BATCH-A'}]} />);
    expect(screen.getByText('BATCH-C · LT-28')).toBeInTheDocument();
    expect(screen.getByText('BATCH-A · LT-28')).toBeInTheDocument();
  });
});
