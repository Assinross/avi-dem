#!/usr/bin/env python3
"""Конвертер таблиц .reg оригинальной игры в JSON (только чтение).

Формат: сигнатура FB 3E AB 45, u16 число записей, хеш-таблица записей
(i16 next, u32 offset). Запись: u16 число полей, u16 длина ключа, ключ,
хеш-таблица полей (по 6 байт), затем поля: u8 тип, u16 длина имени, имя, значение.
Типы: 0 - int32, 1 - float32, 2 - строка (u16 длина + байты cp1251),
тип | 0x80 - массив (u16 количество + элементы).

Запуск: python3 tools/reg2json.py <файл.reg> [<выход.json>]
"""
import json
import struct
import sys

MAGIC = 0x45AB3EFB


def read_str(d, p):
    n = struct.unpack_from('<H', d, p)[0]
    return d[p + 2:p + 2 + n].decode('cp1251', 'replace'), p + 2 + n


def read_value(d, p, t):
    if t == 0:
        return struct.unpack_from('<i', d, p)[0], p + 4
    if t == 1:
        return round(struct.unpack_from('<f', d, p)[0], 4), p + 4
    if t == 2:
        return read_str(d, p)
    raise ValueError('неизвестный тип %d на смещении %d' % (t, p))


def parse(d):
    magic, cnt = struct.unpack_from('<IH', d, 0)
    if magic != MAGIC:
        raise ValueError('неизвестная сигнатура')
    offs = sorted(struct.unpack_from('<hI', d, 6 + i * 6)[1] for i in range(cnt))
    out = {}
    for o in offs:
        nf = struct.unpack_from('<H', d, o)[0]
        key, p = read_str(d, o + 2)
        p += nf * 6
        rec = {}
        for _ in range(nf):
            t = d[p]
            name, p = read_str(d, p + 1)
            if t & 0x80:
                n = struct.unpack_from('<H', d, p)[0]
                p += 2
                arr = []
                for _ in range(n):
                    v, p = read_value(d, p, t & 0x7F)
                    arr.append(v)
                rec[name] = arr
            else:
                rec[name], p = read_value(d, p, t)
        out[key] = rec
    return out


def main():
    with open(sys.argv[1], 'rb') as f:
        data = parse(f.read())
    text = json.dumps(data, ensure_ascii=False, indent=1)
    if len(sys.argv) > 2:
        with open(sys.argv[2], 'w', encoding='utf-8') as f:
            f.write(text)
        print('%s: записей %d' % (sys.argv[2], len(data)))
    else:
        print(text)


if __name__ == '__main__':
    main()
