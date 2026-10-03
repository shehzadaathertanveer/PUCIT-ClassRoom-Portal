import { ROOM_COLOR_CHOICES, getRoomColor, swatchStyle, DEFAULT_ROOM_COLOR } from '../utils/roomColors';

/**
 * Colour swatch picker for a Classroom or Labroom.
 *
 * The same options are offered for both room types so a teacher can pair the
 * theory and practical halves of a course with matching colours. Rooms are told
 * apart by their hinge treatment (dashed spine for Classroom, solid for Labroom)
 * and the existing destination icon, so colour itself never has to carry that
 * distinction.
 */
export default function RoomColorPicker({ value, onChange, disabled = false }) {
  const selected = value || DEFAULT_ROOM_COLOR;

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="text-[10px] sm:text-xs text-slate-400">Room Colour</span>
        <span className="text-[10px] sm:text-xs font-mono" style={{ color: getRoomColor(selected).text }}>
          {getRoomColor(selected).label}
        </span>
      </div>

      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Room colour">
        {ROOM_COLOR_CHOICES.map((key) => {
          const c = getRoomColor(key);
          const isSelected = key === selected;
          return (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={isSelected}
              aria-label={c.label}
              title={c.label}
              disabled={disabled}
              onClick={() => onChange(key)}
              className={`w-8 h-8 rounded-lg border-2 transition-all duration-150 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                isSelected ? 'scale-110' : 'hover:scale-105'
              }`}
              style={swatchStyle(key, isSelected)}
            />
          );
        })}
      </div>

      <p className="mt-2 text-[10px] sm:text-xs text-slate-500 leading-relaxed">
        Applies a soft tint with a coloured edge so students can tell rooms apart. Students see it too.
      </p>
    </div>
  );
}
