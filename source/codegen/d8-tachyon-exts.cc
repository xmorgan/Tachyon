/*===========================================================================*/

/* File: "d8-extensions.cc", Time-stamp: <2010-06-18 13:35:20 feeley> */

/* Copyright (c) 2010 by Marc Feeley, All Rights Reserved. */
/* Copyright (c) 2010 by Maxime Chevalier-Boisvert, All Rights Reserved. */

/*===========================================================================*/

/*
 * This file contains the extensions to the D8 executable.  It implements
 * some auxiliary functions for the Tachyon compiler:
 *
 * - writeFile("filename", "text")  save text to the file
 * - allocMachineCodeBlock(n)       allocate a machine code block of length n
 * - freeMachineCodeBlock(block)    free a machine code block
 * - execMachineCodeBlock(block)    execute a machine code block
 *
 * Note: a MachineCodeBlock is an array of bytes which can be accessed
 * like other JS arrays, in particular you can assign to it.  For example:
 *
 *    var block = allocMachineCodeBlock(2);
 *    block[0] = 0x90;  // x86 "nop"
 *    block[1] = 0xc3;  // x86 "ret"
 *    execMachineCodeBlock(block);
 */

/*
 * To extend D8, the file src/d8.cc must me modified, followed by a
 *
 *   % scons d8
 *
 * There are two modifications; just before and inside of the definition of
 * the method Shell::Initialize().  The code should be modified like this:
 *
 *  #include "d8-tachyon-exts.cc"    // <====== ADDED!
 *
 *  void Shell::Initialize() {
 *  ...
 *
 *  global_template->Set(String::New("load"), FunctionTemplate::New(Load));
 *  global_template->Set(String::New("quit"), FunctionTemplate::New(Quit));
 *  global_template->Set(String::New("version"), FunctionTemplate::New(Version));
 *
 *  INIT_D8_EXTENSIONS;              // <====== ADDED!
 *  ...
 *  }
 */

/*---------------------------------------------------------------------------*/

v8::Handle<v8::Value> writeFile(const v8::Arguments& args)
{
    if (args.Length() != 2)
    {
        printf("Error in WriteFile -- 2 arguments expected\n");
        exit(1);
    }
    else
    {
        v8::String::Utf8Value filename_str(args[0]);  
        const char* filename = *filename_str;
        v8::String::Utf8Value content_str(args[1]);
        const char* content = *content_str;

        FILE *out = fopen(filename, "w");
        if (out == NULL)
        {
            printf("Error in writeFile -- can't open file\n");
            exit(1);
        }
        else
        {
            fprintf(out, "%s", content);
            fclose(out);
        }
    }

    return v8::Undefined();
}

v8::Handle<v8::Value> shellCommand(const v8::Arguments& args)
{
    if (args.Length() != 1)
    {
        printf("Error in openPipe -- 1 argument expected\n");
        exit(1);
    }

    v8::String::Utf8Value cmdStrObj(args[0]);  
    const char* cmdStr = *cmdStrObj;

    FILE* pipeFile = popen(cmdStr, "r");

    if (!pipeFile)
    {
        printf("Error in openPipe -- failed to execute command \"%s\"\n", cmdStr);
        exit(1);        
    }

    char buffer[255];

    char* outStr = NULL;
    size_t strLen = 0;

    while (!feof(pipeFile))
    {
        int numRead = fread(buffer, 1, sizeof(buffer), pipeFile);

        if (ferror(pipeFile))
        {
            printf("Error in openPipe -- failed to read output");
            exit(1);        
        }

        outStr = (char*)realloc(outStr, strLen + numRead + 1);
        memcpy(outStr + strLen, buffer, numRead);
        strLen += numRead;
    }

    outStr[strLen] = '\0';

    pclose(pipeFile);

    v8::Local<v8::String> v8Str = v8::String::New(outStr);

    delete [] outStr;

    return v8Str;
}

/*---------------------------------------------------------------------------*/

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include <sys/mman.h>

typedef int word; // must correspond to natural word width of CPU

typedef word (*c_handler)();

typedef struct
{
    word stack_limit; // stack allocation limit, also used for polling interrupts
    word heap_limit;  // heap allocation limit
    c_handler handlers[3];  // C functions called by the code generated by the compiler
} runtime_context;

typedef word (*mach_code_ptr)(runtime_context*);

typedef union
{
    mach_code_ptr fn_ptr;
    uint8_t* data_ptr;
}   data_to_fn_ptr_caster;

uint8_t *alloc_machine_code_block(int size)
{
    void* p = mmap(
        0,
        size,
        PROT_READ | PROT_WRITE | PROT_EXEC,
        MAP_PRIVATE | MAP_ANON,
        -1,
        0
    );

    return (uint8_t*)p;
}

void free_machine_code_block(uint8_t* code, int size)
{
    munmap(code, size);
}

uint8_t *alloc_memory_block(int size)
{
    void* block = malloc(size);

    return (uint8_t*)block;
}

void free_memory_block(uint8_t* block)
{
    free(block);
}

/*---------------------------------------------------------------------------*/

/* various handlers that the generated code can call */
word handler0(void)           { printf("hello world!\n"); return 11; }
word handler1(word x)         { printf("x = %d\n", x);    return 22; }
word handler2(word x, word y) { return x+y; }

v8::Handle<v8::Value> allocMachineCodeBlock(const v8::Arguments& args)
{
    if (args.Length() != 1)
    {
        printf("Error in allocMachineCodeBlock -- 1 argument expected\n");
        exit(1);
    }
    else
    {
        int len = args[0]->Int32Value();
        uint8_t* block = static_cast<uint8_t*>(alloc_machine_code_block(len));
        v8::Handle<v8::Object> obj = v8::Object::New();
        i::Handle<i::JSObject> jsobj = v8::Utils::OpenHandle(*obj);

        /* Set the elements to be the external array. */
        obj->SetIndexedPropertiesToExternalArrayData(
            block,
            v8::kExternalUnsignedByteArray,
            len
        );

        return obj;
    }
}

v8::Handle<v8::Value> freeMachineCodeBlock(const v8::Arguments& args)
{
    if (args.Length() != 1)
    {
        printf("Error in freeMachineCodeBlock -- 1 argument expected\n");
        exit(1);
    }
    else
    {
        i::Handle<i::JSObject> jsobj = v8::Utils::OpenHandle(*args[0]);

        Handle<v8::internal::ExternalUnsignedByteArray> array(
            v8::internal::ExternalUnsignedByteArray::cast(jsobj->elements())
        );

        uint32_t len = static_cast<uint32_t>(array->length());
        uint8_t* block = static_cast<uint8_t*>(array->external_pointer());

        free_machine_code_block(block, len);

        return Undefined();
    }
}

v8::Handle<v8::Value> execMachineCodeBlock(const v8::Arguments& args)
{
    if (args.Length() != 1)
    {
        printf("Error in execMachineCodeBlock -- 1 argument expected\n");
        exit(1);
    }
    else
    {
        i::Handle<i::JSObject> jsobj = v8::Utils::OpenHandle(*args[0]);

        Handle<v8::internal::ExternalUnsignedByteArray> array(
            v8::internal::ExternalUnsignedByteArray::cast(jsobj->elements())
        );

        /* uint32_t len = static_cast<uint32_t>(array->length()); */
        uint8_t* block = static_cast<uint8_t*>(array->external_pointer());

        // Allocate a run-time context object on the stack
        runtime_context rtc;

        rtc.stack_limit = 0; // TODO: actually set the correct limit
        rtc.heap_limit  = 0; // TODO: actually set the correct limit
        rtc.handlers[0] = (c_handler)handler0;
        rtc.handlers[1] = (c_handler)handler1;
        rtc.handlers[2] = (c_handler)handler2;

        data_to_fn_ptr_caster ptr;
        ptr.data_ptr = block;
    
        // Execute the code, passing it a pointer to the run-time context
        word result = ptr.fn_ptr(&rtc);

        return v8::Number::New(result);
    }
}

v8::Handle<v8::Value> allocMemoryBlock(const v8::Arguments& args)
{
    if (args.Length() != 1)
    {
        printf("Error in allocMemoryBlock -- 1 argument expected\n");
        exit(1);
    }
    else
    {
        int len = args[0]->Int32Value();
        uint8_t* block = static_cast<uint8_t*>(alloc_memory_block(len));
        v8::Handle<v8::Object> obj = v8::Object::New();
        i::Handle<i::JSObject> jsobj = v8::Utils::OpenHandle(*obj);

        /* Set the elements to be the external array. */
        obj->SetIndexedPropertiesToExternalArrayData(
            block,
            v8::kExternalUnsignedByteArray,
            len
        );

        return obj;
    }
}

v8::Handle<v8::Value> freeMemoryBlock(const v8::Arguments& args)
{
    if (args.Length() != 1)
    {
        printf("Error in freeMemoryBlock -- 1 argument expected\n");
        exit(1);
    }
    else
    {
        i::Handle<i::JSObject> jsobj = v8::Utils::OpenHandle(*args[0]);

        Handle<v8::internal::ExternalUnsignedByteArray> array(
            v8::internal::ExternalUnsignedByteArray::cast(jsobj->elements())
        );

        uint8_t* block = static_cast<uint8_t*>(array->external_pointer());

        free_memory_block(block);

        return Undefined();
    }
}

// Convert an array of bytes to a value
template <class T> T arrayToVal(const v8::Value* arrayVal)
{
    //i::Handle<i::JSObject> jsobj = v8::Utils::OpenHandle(arrayVal);

    const v8::Local<v8::Object> jsObj = arrayVal->ToObject();

    T val;

    for (size_t i = 0; i < sizeof(T); ++i)
    {
        uint8_t* bytePtr = (uint8_t*)(&val) + i;

        if (!jsObj->Has(i))
        {
            printf("Error in arrayToVal -- array does not match value size\n");
            exit(1);
        }

        const v8::Local<v8::Value> jsVal = jsObj->Get(i);        

        int intVal = jsVal->Int32Value();

        if (intVal < 0 || intVal > 255)
        {
            printf("Error in arrayToVal -- value outside of byte range\n");
            exit(1);
        }

        *bytePtr = intVal;
    }

    return val;
}

// Convert a value to an array of bytes
template <class T> v8::Handle<v8::Value> valToArray(T val)
{
    // Create an array to store the pointer data
    i::Handle<i::JSArray> ptrArray = i::Factory::NewJSArray(sizeof(val));
    ASSERT(array->IsJSArray() && array->HasFastElements());

    // Write the value into the array, byte-per-byte
    for (size_t i = 0; i < sizeof(val); ++i) 
    {
        uint8_t* bytePtr = ((uint8_t*)&val) + i;
        i::Object* element = i::Smi::FromInt(*bytePtr);

        ptrArray->SetFastElement(i, element);
    }

    return Utils::ToLocal(ptrArray);
}

v8::Handle<v8::Value> getBlockAddr(const v8::Arguments& args)
{
    if (args.Length() < 1 || args.Length() > 2)
    {
        printf("Error in getBlockAddress -- 1 or 2 argument expected\n");
        exit(1);
    }

    // Get the address of the block
    i::Handle<i::JSObject> blockObj = v8::Utils::OpenHandle(*args[0]);
    Handle<v8::internal::ExternalUnsignedByteArray> array(
        v8::internal::ExternalUnsignedByteArray::cast(blockObj->elements())
    );
    uint8_t* blockPtr = static_cast<uint8_t*>(array->external_pointer());
    uint32_t len = static_cast<uint32_t>(array->length());

    // Get the index value
    size_t idxVal = 0;
    if (args.Length() > 1)
    {
        i::Handle<i::Object> idxObj = v8::Utils::OpenHandle(*args[1]);
        idxVal = (size_t)idxObj->Number();
    }

    // Ensure that the index is valid
    if (idxVal >= len)
    {
        printf("Error in getBlockAddress -- index is past end of block\n");
        exit(1);
    }

    // Compute the address
    uint8_t* address = blockPtr + idxVal;

    return valToArray(address);
}

/*---------------------------------------------------------------------------*/

void printHello()
{
    printf("Hello!\n");
}

void printInt(int val)
{
    printf("%d\n", val);
}

void print2Ints(int val1, int val2)
{
    printf("%d and %d\n", val1, val2);
}

void print2Shorts(short val1, short val2)
{
    printf("%d and %d\n", (int)val1, (int)val2);
}

int sum2Ints(int v1, int v2)
{
    return v1 + v2;
}

typedef void (*FPTR)();

v8::Handle<v8::Value> getFuncAddr(const v8::Arguments& args)
{
    if (args.Length() != 1)
    {
        printf("Error in getFuncAddr -- 1 argument expected\n");
        exit(1);
    }

    v8::String::Utf8Value funcName(args[0]);  
    char* fName = *funcName;

    FPTR address = NULL;

    if (strcmp(fName, "printHello") == 0)
        address = (FPTR)(printHello);
    else if (strcmp(fName, "printInt") == 0)
        address = (FPTR)(printInt);
    else if (strcmp(fName, "print2Ints") == 0)
        address = (FPTR)(print2Ints);
    else if (strcmp(fName, "print2Shorts") == 0)
        address = (FPTR)(print2Shorts);
    else if (strcmp(fName, "sum2Ints") == 0)
        address = (FPTR)(sum2Ints);

    if (address == NULL)
    {
        printf("C function not found\n");
        exit(1);
    }

    return valToArray(address);
}

// Union type for values returned by Tachyon functions
union TachVal
{
    int intVal;
    void* ptrVal;
};

// Pointer to a Tachyon function
typedef int (*TACHYON_FPTR)(void*, ...);

// Call a Tachyon function through its FFI
// First argument is a function pointer
// Second argument is a context pointer
// Other arguments are to be passed to the function
v8::Handle<v8::Value> callTachyonFFI(const v8::Arguments& args)
{
    // TODO:
    // First arg: vector of strings describing arg types
    // Second arg: string describing return type
    // Third arg: func ptr
    // Fourth arg: context ptr
    // Other args: args to be passed

    if (args.Length() < 2)
    {
        printf("Error in callTachyonFFI -- 2 or more argument expected\n");
        exit(1);
    }

    // Get the function pointer
    TACHYON_FPTR funcPtr = arrayToVal<TACHYON_FPTR>(*args[0]);
    
    // Get the context pointer
    uint8_t* ctxPtr = arrayToVal<uint8_t*>(*args[1]);
    
    printf("Got func ptr and ctx ptr\n");

    size_t numArgs = args.Length() - 2;
    TachVal* tachArgs = new TachVal[numArgs];

    for (size_t i = 0; i < numArgs; ++i)
    {
        const v8::Value* arg = *args[i + 2];

        TachVal& tachArg = tachArgs[i];

        if (arg->IsNumber())
        {
            tachArg.intVal = arg->Int32Value();

            printf("Arg %d = %d\n", i, tachArg.intVal);
        }
        else
        {
            printf("Error in callTachyonFFI -- unsupported argument type\n");
            exit(1);
        }
    }

    TachVal retVal;
    switch (numArgs)
    {
        case 0:
        retVal.intVal = funcPtr(
            ctxPtr
        );
        break;

        case 1:
        retVal.intVal = funcPtr(
            ctxPtr,
            tachArgs[0].intVal
        );
        break;

        case 2:
        retVal.intVal = funcPtr(
            ctxPtr, 
            tachArgs[0].intVal, 
            tachArgs[1].intVal
        );
        break;

        case 3:
        printf("Calling Tachyon func with 3 arguments\n");
        retVal.intVal = funcPtr(
            ctxPtr,
            tachArgs[0].intVal,
            tachArgs[1].intVal,
            tachArgs[2].intVal
        );
        printf("Returned from Tachyon func\n");
        break;

        default:
        printf("Error in callTachyonFFI -- unsupported argument count\n");
        exit(1);
    }

    delete [] tachArgs;

    v8::Handle<v8::Value> numVal = v8::Number::New(retVal.intVal);

    printf("returning from tachyonCallFFI\n");

    return numVal;
}

/*---------------------------------------------------------------------------*/

#define INIT_D8_EXTENSIONS init_d8_extensions(global_template)

void init_d8_extensions(v8::Handle<ObjectTemplate> global_template)
{
    global_template->Set(
        v8::String::New("writeFile"), 
        v8::FunctionTemplate::New(writeFile)
    );

    global_template->Set(
        v8::String::New("shellCommand"), 
        v8::FunctionTemplate::New(shellCommand)
    );

    global_template->Set(
        v8::String::New("allocMachineCodeBlock"), 
        v8::FunctionTemplate::New(allocMachineCodeBlock)
    );

    global_template->Set(
        v8::String::New("freeMachineCodeBlock"), 
        v8::FunctionTemplate::New(freeMachineCodeBlock)
    );

    global_template->Set(
        v8::String::New("execMachineCodeBlock"),
        v8::FunctionTemplate::New(execMachineCodeBlock)
    );

    global_template->Set(
        v8::String::New("allocMemoryBlock"), 
        v8::FunctionTemplate::New(allocMemoryBlock)
    );

    global_template->Set(
        v8::String::New("freeMemoryBlock"), 
        v8::FunctionTemplate::New(freeMemoryBlock)
    );

    global_template->Set(
        v8::String::New("getBlockAddr"), 
        v8::FunctionTemplate::New(getBlockAddr)
    );

    global_template->Set(
        v8::String::New("getFuncAddr"), 
        v8::FunctionTemplate::New(getFuncAddr)
    );

    global_template->Set(
        v8::String::New("callTachyonFFI"),
        v8::FunctionTemplate::New(callTachyonFFI)
    );
}

/*===========================================================================*/

