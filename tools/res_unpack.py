#!/usr/bin/env python3
"""Распаковка ресурсных архивов .res оригинальной игры (только чтение).

Формат: заголовок 16 байт (сигнатура 3C E2 9C 01, число файлов, смещение
и размер каталога), каталог из записей по 22 байта
(next i32, size u32, offset u32, time u32, namelen u16, nameoff u32),
за каталогом - блок имён.

Запуск: python3 tools/res_unpack.py <файл.res> [папка_вывода] [--list]
"""
import os
import struct
import sys

MAGIC = 0x019CE23C


def read_index(path):
    with open(path, 'rb') as f:
        data = f.read()
    magic, count, dir_off, dir_size = struct.unpack_from('<4I', data, 0)
    if magic != MAGIC:
        raise ValueError('неизвестная сигнатура: %s' % path)
    names_off = dir_off + count * 22
    entries = []
    for i in range(count):
        _next, size, off, _time, nlen, noff = struct.unpack_from('<iIIIHI', data, dir_off + i * 22)
        name = data[names_off + noff:names_off + noff + nlen].decode('cp1251')
        entries.append((name, off, size))
    return data, entries


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    data, entries = read_index(args[0])
    if '--list' in sys.argv or len(args) < 2:
        for name, off, size in entries:
            print('%10d  %s' % (size, name))
        return
    out = args[1]
    for name, off, size in entries:
        dst = os.path.join(out, name.replace('\\', '/'))
        os.makedirs(os.path.dirname(dst) or '.', exist_ok=True)
        with open(dst, 'wb') as f:
            f.write(data[off:off + size])
    print('распаковано файлов: %d -> %s' % (len(entries), out))


if __name__ == '__main__':
    main()
