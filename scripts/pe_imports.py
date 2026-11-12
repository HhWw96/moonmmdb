"""Read import names from a PE32+ x64 executable without invoking its code."""
import struct
from pathlib import Path

def pe_imports(path):
    data=Path(path).read_bytes()
    if len(data)>256*1024*1024 or data[:2]!=b'MZ':raise ValueError('Invalid PE file')
    pe=struct.unpack_from('<I',data,0x3c)[0]
    if data[pe:pe+4]!=b'PE\0\0':raise ValueError('Missing PE signature')
    machine,sections=struct.unpack_from('<HH',data,pe+4)
    optional_size=struct.unpack_from('<H',data,pe+20)[0]
    optional=pe+24
    if machine!=0x8664 or struct.unpack_from('<H',data,optional)[0]!=0x20b:raise ValueError('Expected x64 PE32+')
    import_rva,import_size=struct.unpack_from('<II',data,optional+120)
    table=optional+optional_size
    def offset(rva):
        for i in range(sections):
            virtual_size,virtual_address,raw_size,raw_offset=struct.unpack_from('<IIII',data,table+40*i+8)
            if virtual_address<=rva<virtual_address+min(virtual_size,raw_size):
                at=raw_offset+rva-virtual_address
                if at<len(data):return at
        raise ValueError('PE RVA outside section data')
    if not import_rva:return []
    imports=[]
    for i in range(min(import_size//20,4096)):
        descriptor=offset(import_rva+20*i)
        values=struct.unpack_from('<IIIII',data,descriptor)
        if not any(values):return imports
        at=offset(values[3]);end=data.find(b'\0',at,min(at+257,len(data)))
        if end<0:raise ValueError('Invalid PE import name')
        imports.append(data[at:end].decode('ascii'))
    raise ValueError('Unterminated PE import table')
