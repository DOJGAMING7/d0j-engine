package com.d0j.engine.vm;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Differential probe. Caller supplies the memory window; this class never
 * guesses an address and only reports values it actually read twice.
 */
public final class VMStateProbe {
    private final VMMemoryReader reader;
    private final Map<String, Map<Long, Float>> captures = new LinkedHashMap<String, Map<Long, Float>>();

    public VMStateProbe(VMMemoryReader reader) {
        this.reader = reader;
    }

    public static final class Change {
        public long address;
        public float before;
        public float after;

        public JSONObject toJson() throws Exception {
            JSONObject value = new JSONObject();
            value.put("address", "0x" + Long.toHexString(address));
            value.put("before", before);
            value.put("after", after);
            value.put("delta", Math.abs(after - before));
            return value;
        }
    }

    public int capture(String label, long base, int length, int stride) throws Exception {
        if (reader == null) throw new IllegalStateException("NO_MEMORY_READER");
        if (!reader.isReady()) throw new IllegalStateException(reader.reason());
        if (stride < 4 || length < stride) throw new IllegalArgumentException("BAD_WINDOW");
        Map<Long, Float> values = reader.window(base, length, stride);
        if (values == null) values = new LinkedHashMap<Long, Float>();
        captures.put(label, values);
        return values.size();
    }

    public List<Change> diff(String beforeLabel, String afterLabel) {
        List<Change> changes = new ArrayList<Change>();
        Map<Long, Float> before = captures.get(beforeLabel);
        Map<Long, Float> after = captures.get(afterLabel);
        if (before == null || after == null) return changes;
        for (Map.Entry<Long, Float> entry : before.entrySet()) {
            Float next = after.get(entry.getKey());
            if (next == null || next.floatValue() == entry.getValue().floatValue()) continue;
            Change change = new Change();
            change.address = entry.getKey().longValue();
            change.before = entry.getValue().floatValue();
            change.after = next.floatValue();
            changes.add(change);
        }
        changes.sort((a, b) -> Double.compare(
                Math.abs(b.after - b.before), Math.abs(a.after - a.before)));
        return changes;
    }

    public void clear() {
        captures.clear();
    }

    public JSONObject report(String beforeLabel, String afterLabel, int limit) throws Exception {
        JSONObject value = new JSONObject();
        value.put("captures", new JSONArray(new ArrayList<String>(captures.keySet())));
        List<Change> changes = diff(beforeLabel, afterLabel);
        JSONArray array = new JSONArray();
        int count = Math.max(0, Math.min(limit, changes.size()));
        for (int i = 0; i < count; i++) array.put(changes.get(i).toJson());
        value.put("changes", array);
        value.put("totalChanges", changes.size());
        value.put("measured", reader != null && reader.isReady());
        return value;
    }
}
