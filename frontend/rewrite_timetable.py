import re
with open(r'd:\Falcon\frontend\src\app\(portals)\student\timetable\page.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace HOURS definition
old_hours_pattern = r"const HOURS = \[.*?\];"
new_hours = """const HOURS = [9, 10, 11, 12, 13, 14, 15, 16];
const LUNCH_HOUR = 13;

function formatTime(hour: number) {
  const h = hour > 12 ? hour - 12 : hour;
  const ampm = hour >= 12 ? 'PM' : 'AM';
  return `${h}:00 ${ampm}`;
}"""
content = re.sub(old_hours_pattern, new_hours, content, flags=re.DOTALL)

# Remove unused functions and constants
content = re.sub(r"function timeToMinutes.*?\n\}\n", "", content, flags=re.DOTALL)
content = re.sub(r"const START_MINUTES = 9 \* 60; // 9:00 AM\nconst END_MINUTES = 17 \* 60; // 5:00 PM\nconst TOTAL_MINUTES = END_MINUTES - START_MINUTES;\n", "", content, flags=re.DOTALL)

# Replace Desktop View
old_desktop_pattern = r"\{\/\* Desktop View \*\/\}.*?\{\/\* Mobile View \*\/\}"
new_desktop = """{/* Desktop View */}
            <div className="hidden lg:block relative overflow-x-auto pb-2">
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-x-auto">
                <table className="w-full min-w-[600px] border-collapse">
                  <thead>
                    <tr>
                      <th className="p-2 border-b border-r bg-slate-50 text-[10px] font-bold text-slate-500 uppercase tracking-wider w-16 text-center">Time</th>
                      {DAYS.map(day => (
                        <th key={day.id} className="p-2 border-b border-r bg-slate-50 text-[10px] font-bold text-sgvu-navy uppercase tracking-wider text-center w-24">
                          {day.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {HOURS.map(hour => {
                      const isLunch = hour === LUNCH_HOUR;
                      const timeStr = `${hour.toString().padStart(2, '0')}:00:00`;
                      return (
                        <tr key={hour}>
                          <td className="p-1 border-b border-r bg-slate-50 text-[10px] font-semibold text-slate-500 text-center whitespace-nowrap align-middle">
                            {formatTime(hour)}
                          </td>
                          {isLunch ? (
                            <td colSpan={6} className="p-1 border-b bg-slate-100 text-center text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em]">
                              Lunch Break
                            </td>
                          ) : (
                            DAYS.map(day => {
                              const daySlots = slotsByDay.get(day.id) ?? [];
                              const slotsInCell = daySlots.filter(s => s.start_time === timeStr);
                              return (
                                <td
                                  key={`${day.id}-${hour}`}
                                  className="p-1 border-b border-r h-14 align-top relative min-w-[90px]"
                                >
                                  <div className="absolute inset-0 z-0 p-0.5">
                                    <div className="w-full h-full border rounded transition-colors" />
                                  </div>
                                  <div className="relative z-10 flex flex-col gap-0.5 w-full h-full">
                                    {slotsInCell.map((slot) => (
                                      <div
                                        key={slot.timetable_id}
                                        className={cn("group text-[9px] rounded p-1 shadow-sm transition-all relative flex flex-col leading-tight", slot.is_virtual ? "bg-blue-50 border-l-2 border-blue-400 text-blue-900" : "bg-sgvu-navy text-white border-l-2 border-sgvu-gold hover:shadow-md")}
                                      >
                                        <span className="font-bold truncate pr-3">{slot.course_code}</span>
                                        {slot.faculty_name && (
                                          <span className="text-[7.5px] font-medium truncate opacity-90 leading-[10px] mt-0.5">{slot.faculty_name}</span>
                                        )}
                                        {slot.room && !slot.is_virtual && (
                                          <span className="text-[7.5px] font-medium truncate opacity-90 leading-[10px] mt-0.5">{slot.room}</span>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                </td>
                              );
                            })
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Mobile View */}"""
content = re.sub(old_desktop_pattern, new_desktop, content, flags=re.DOTALL)

with open(r'd:\Falcon\frontend\src\app\(portals)\student\timetable\page.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
