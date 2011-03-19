/**
@fileOverview
Generic assembler.

The following code was inspired by the Gambit code 
generator written in Scheme.

@copyright
Copyright (c) 2010 Tachyon Javascript Engine, All Rights Reserved
*/

/** @namespace */
var asm = {};

/**
    Returns a new code block object.
 
    @class code block for generating code bytes
    @param {Number}  startPos 
    @param {Boolean} bigEndian defaults to false (x86 case)
    @param {Boolean} listing defaults to false
*/
asm.CodeBlock = function (startPos, bigEndian, listing)
{
    if (startPos === undefined)
        startPos = 0;

    if (bigEndian === undefined)
        bigEndian = false;

    if (listing === undefined)
        listing = false;

    /** Offset at which the code will be generated */
    this.startPos     = startPos;

    /** Byte ordering for values over 1 byte */
    this.bigEndian    = bigEndian; // Let's default to the x86 case 

    /** Flag for listing output */
    this.useListing   = listing;


    /** @private Array containing the generated bytes */
    this.code = [];

    /** @private Array containing the provided objects */
    this.providedArray = [];

    /** @private Array containing the required objects */
    this.requiredArray = [];
};

/** Throw an exception with message and args */
asm.error = function (message)
{
    var err = message;
    for (var i=1; i<arguments.length; i++)
    {
        err += arguments[i];
    }
    throw "AsmError: " + err;
};

/** Ensure a boolean condition is met, otherwise throw an exception */
asm.assert = function (bool, message)
{
    if (!bool) 
    { 
        asm.error.apply(null, Array.prototype.slice.call(arguments, 1));
    } 
};

/** @private Adds a number or an object at the end of the code block */
asm.CodeBlock.prototype.extend = function (x)
{
    this.code.push(x);
};

/** Adds an 8 bit number at the end of the code block. Can be chained. */
asm.CodeBlock.prototype.gen8 = function (n)
{
    this.extend(num_and(n, 0xff));
    return this;
};


/** Adds a 16 bit number at the end of the code block. Can be chained. */
asm.CodeBlock.prototype.gen16 = function (n)
{
    if (this.bigEndian)
        this.gen16BE(n);
    else
        this.gen16LE(n);
    return this;
};

/** 
    @private 
    Adds a 16 bit number in Big Endian order at the end of the 
    code block
*/ 
asm.CodeBlock.prototype.gen16BE = function (n)
{
    this.gen8(num_shift(n, -8));
    this.gen8(n);
    return this;
};

/**
    @private 
    Adds a 16 bit number in Little Endian order at the end of the 
    code block
*/ 
asm.CodeBlock.prototype.gen16LE = function (n)
{
    this.gen8(n);
    this.gen8(num_shift(n, -8));
    return this;
};


/** Adds a 32 bit number at the end of the code block. Can be chained. */
asm.CodeBlock.prototype.gen32 = function (n)
{
    if (this.bigEndian)
        this.gen32BE(n);
    else
        this.gen32LE(n);
    return this;
};


/** 
    @private 
    Adds a 32 bit number in Big Endian order at the end of the 
    code block
*/ 
asm.CodeBlock.prototype.gen32BE = function (n)
{
    this.gen16(num_shift(n, -16));
    this.gen16(n);
    return this;
};


/**
    @private 
    Adds a 32 bit number in Little Endian order at the end of the 
    code block
*/ 
asm.CodeBlock.prototype.gen32LE = function (n)
{
    this.gen16(n);
    this.gen16(num_shift(n, -16));
    return this;
};

/** Adds a 64 bit number at the end of the code block. Can be chained. */
asm.CodeBlock.prototype.gen64 = function (n)
{
    if (this.bigEndian)
        this.gen64BE(n);
    else
        this.gen64LE(n);
    return this;
};


/** 
    @private 
    Adds a 64 bit number in Big Endian order at the end of the 
    code block
*/ 
asm.CodeBlock.prototype.gen64BE = function (n)
{
    this.gen32(num_shift(n, -32));
    this.gen32(n);
    return this;
};

/**
    @private 
    Adds a 64 bit number in Little Endian order at the end of the 
    code block
*/ 
asm.CodeBlock.prototype.gen64LE = function (n)
{
    this.gen32(n);
    this.gen32(num_shift(n, -32));
    return this;
};

/** 
    @private
    Adds a 'width' bit number at the end of the code block. 
    Can be chained.
*/
asm.CodeBlock.prototype.genNumber = function (width, n)
{
    switch (width) 
    {
        case 8:
            this.gen8(n);
            break;

        case 16:
            this.gen16(n);
            break;

        case 32:
            this.gen32(n);
            break;

        case 64:
            this.gen64(n);
            break;
        
        default:
            error("Invalid width: '" + width + "'");
    }
    return this;
};

/** @namespace */
asm.type = {};
/** Generic asm object */
asm.type.OBJ = "ASM_OBJ";
/** Label */
asm.type.LBL = "ASM_LABEL";
/** Deferred value */
asm.type.DEF = "ASM_DEFERRED";
/** Listing */
asm.type.LST = "ASM_LISTING";

/**
    Returns a new asm generic object. Note: the lower case constructor
    means new is not necessary to create an object of this class

    @class asm object
*/
asm.CodeBlock.obj = function () 
{ 
    return Object.create(asm.CodeBlock.obj.prototype);
};

/** asm object type */
asm.CodeBlock.obj.prototype.type = asm.type.OBJ;

/** Returns a string representation containing the type and 
    properties of the asm object */
asm.CodeBlock.obj.prototype.toString = function ()
{
    var s = [];
    for (var p in this)
    {
        if (typeof this[p] !== "function")
        {
            s.push( ((this.hasOwnProperty(p)) ? "" : "*") + // Mark parent prop 
                    p + ":" + String(this[p]));
        }
    } 

    return asm.type + "(" + s.join(", ") + ")";
};

/** 
    Returns a new label object. Note: the lower case constructor
    means new is not necessary to create an object of this class 

    @class Label object
    @augments asm.CodeBlock.obj
    @param {String or Number} id  optional, string that will be printed 
                                  in listings
*/
asm.CodeBlock.prototype.label   = function (id)
{
    const label = asm.CodeBlock.prototype.label;
   
    var that = Object.create(asm.CodeBlock.prototype.label.prototype);

    /** @private Value that will be printed in listing */
    if (id !== undefined)
        that.id = id;
    else
        that.id = "L" + label.nextId++;

    /** @private Current position of the label, might change during assembly */
    that._pos = null;

    return that;
};
/** @private value for the default label */
asm.CodeBlock.prototype.label.nextId = 0;

asm.CodeBlock.prototype.label.prototype = asm.CodeBlock.obj();
/** asm object type */
asm.CodeBlock.prototype.label.prototype.type = asm.type.LBL; 

/** String representation of the label name */
asm.CodeBlock.prototype.label.prototype.name = function ()
{
    if (typeof this.id === "string")
    {
        return this.id;
    } else if (typeof this.id === "number")
    {
        return "_" + this.id.toString();
    } else
    {
        asm.error("this type of label id is not supported");
    } 
};

// TODO: Refactor to use getter and setter once the compiler support them
/** Retrieve the current position of the label */
asm.CodeBlock.prototype.label.prototype.getPos = function ()
{
    asm.assert(this._pos !== null, "undefined label", this);
    return this._pos;
}; 

/** 
    Assign the new position of the label 
    @param {Number} p
*/
asm.CodeBlock.prototype.label.prototype.setPos = function (p)
{
    asm.assert(typeof p === "number", "Invalid position");
    this._pos = p;
};

/** 
    Adds a label to the code block.
    @param {asm.CodeBlock#label} label 
*/
asm.CodeBlock.prototype.genLabel = function (label)
{
    if (label._pos !== null) 
    { 
        asm.error("label multiply defined: ", label); 
    } else
    {
        label.setPos(0);
        this.extend(label);
    }
    return this;
};

/** 
    Returns a new listing object. Note: the lower case constructor
    means new is not necessary to create an object of this class 

    @class Listing object
    @augments asm.CodeBlock.obj
    @param {String} text  string that will be printed in listings
*/
asm.CodeBlock.prototype.listing = function (text)
{
    asm.assert(text !== undefined, "no text supplied for listing");

    var that = Object.create(asm.CodeBlock.prototype.listing.prototype);
    that.text = text;
    return that;
};
asm.CodeBlock.prototype.listing.prototype = asm.CodeBlock.obj();
/** asm object type */
asm.CodeBlock.prototype.listing.prototype.type = asm.type.LST;

/** 
   Produces a string representing the listing of the code block.
   When printed, the string should output with this schema:
  
   |- position -| |- hex code -|- optional listing -|
     fixed width   fixed width    variable width
  
   Each instruction will be printed on one or two lines depending on the
   number of bytes needed to encode the instruction
  
   Precondition: Code Block must have been assembled
*/
asm.CodeBlock.prototype.listingString = function (fromIndex, toIndex)
{
    // Constants controlling the output layout
    const textCol   = 32;
    const posWidth  =  6;
    const byteWidth =  3;

    const digits = 
        ["0", "1", "2", "3", "4", "5", "6" , "7", "8", "9", 
         "a", "b", "c", "d", "e", "f"];
             

    /** @ignore */
    function printDigit(d) { return digits[d]; };
    /** @ignore */
    function printByte(b) 
    { 
        return printDigit(b >> 4) + printDigit(b % 16) + " "; 
    };

    /** @ignore */
    function printPos(p)
    {
        var s = new Array(posWidth);

        // Adds every digit of the position starting from the
        // least significant
        for (var i=posWidth-1; i>=0; i--)
        {
            s[i] = printDigit(p % 16);
            p = p >> 4;
        }

        return s.join("");
    };

    /** @ignore */
    function spaces(n) 
    {
        return new Array(n+1).join(" ");
    };

    /** @ignore */
    function newline() { return "\n"; }

    // Let's approximate the overhead for the additional storage
    // required to be 25 % ( position printing and new line chars)
    // Preallocate a buffered string for printing
    var s = new Array((this.code.length*5) >> 2);
    var index = 0; // index to the buffered string

    // Variables for controlling the output printing
    var pos = this.startPos;
    var col = 0;

    if (toIndex === undefined)
        toIndex = this.code.length;

    for (var i=0; i<toIndex; i++)
    {
        if (typeof this.code[i] === "number" && i < fromIndex)
        {
            // skip to next
            index++;
            pos++;
        } else if (typeof this.code[i] === "number")
        {
            // The previous line was full, print the new position
            if (col === 0 || col >= (textCol - byteWidth))
            {
                if (col !== 0) { s[index++] = newline(); };
                s[index++] = printPos(pos) + " ";
                col = posWidth + 1;
            }
           
            // Print the next byte 
            s[index++] = printByte(this.code[i]);
            pos++;
            col = col + byteWidth;

        } else if (this.code[i].type === asm.type.LST && i < fromIndex)
        {
            // do nothing 
        } else if (this.code[i].type === asm.type.LST)
        {

            // Print the position again if we are at the beginning
            // of a line
            if (col === 0) 
            { 
                s[index++] = printPos(pos); 
                col = posWidth;
            }         

            // Fill with empty spaces the rest of the hex code
            // block and print the listing with a space separating
            // the hex code and the listing
            s[index++] = spaces(textCol - col - 1) + 
                         this.code[i].text + newline();
            col = 0;
        } else 
        {
            // TODO: Should print something to indicate which
            //       element were not assembled, for now
            //       we will just ignore them
        }
    }
   
    // Close the last line 
    if (col > 0) { s[index++] = newline(); } 

    // Return as a string
    return s.join("");
};

/** Adds text to the code block as a listing object */
asm.CodeBlock.prototype.genListing = function (text)
{
    this.extend(this.listing(text));
    return this;
};

/** 
    Returns a deferred object.

    @class
    <p>A deferred object is an object whose byte representation depends on 
    other objects in the code block. It might depends for example on a 
    label position, which might, in turn, depends on other deferred objects.</p>

    <p>To generate code for the deferred object, pairs of check and production
    functions are needed.</p>

    <p>Check functions decide if, given the current state of the code block,
    the code produced by the corresponding production function is valid.
    If the code is not valid, it must returns null. Otherwise it must
    returns the size of the code generated by the production function.</p>

    <p>Production functions add the byte representation of the deferred
    object to the code block.</p>

    <p>Check function will be tested in succession until a valid one is found.
    The last check function of the check array must always returns
    a valid size.</p>

    <p>Pairs of check and production functions must appear at the same
    index position in their respective array.</p>

    <p>The preferred way of adding a deferred object to the code block
    is through the method {@link asm.CodeBlock#genDeferred}.  
    One doesn't need to directly call the deferred constructor.</p>

    <p>Example for an hypothetical assembly:</p>
    <pre>

        // First check procedure
        function shortDispCheck(codeBlock, position)
        {
            var dist = label.getPos() - position;
            if (dist >= -128 && dist <= 127)
                return 2;
            else
                return null;
        }

        // Second check procedure
        function generalDispCheck(codeBlock, position) { return 5; }

        // First production procedure
        function shortDispProd(codeBlock, position)
        {
            cb.gen8(0x34).gen8(label.getPos() - position);
        }

        // Second production procedure
        function generalDispProd(codeBlock, position)
        {
            cb.gen8(0x35).gen32(label.getPos() - position);
        }

        codeBlock.genDeferred([shortDispCheck, generalDispCheck],
                              [shortDispProd, generalDispProd]);
    </pre> 

    @param {Array} checks array of check functions in 
                   increasing order of generality
    @param {Array} prods  array of production functions 
                   in increasing order of generality
*/
asm.CodeBlock.prototype.deferred = function (checks, prods)
{
    asm.assert(checks !== undefined && checks.length >= 1,
               "expecting checks to be an array of at least one function");

    asm.assert(prods !== undefined && prods.length >= 1,
               "expecting prods to be an array of at least one function");

    asm.assert(checks.length === prods.length,
               "The number of checks procedure must be equal" +
               " to the number of prods procedure");
    var that = Object.create(asm.CodeBlock.prototype.deferred.prototype);

    /** @private check function array */
    that.checks = checks;
    /** @private production function array */
    that.prods  = prods;
   
    /** @private last valid index tested */ 
    that.current = 0;
    /** @private last size determined from a check procedure */
    that.size    = 0; 

    that.length = checks.length;

    return that;
};

asm.CodeBlock.prototype.deferred.prototype = asm.CodeBlock.obj();
/** asm object type */
asm.CodeBlock.prototype.deferred.prototype.type   = asm.type.DEF;

/** 
    Adds a deferred object to the code block. 
    See {@link asm.CodeBlock#deferred} for an explanation of the 
                                        deferred object

    @param {Array} checks array of check functions in 
                   increasing order of generality
    @param {Array} prods  array of production functions 
                   in increasing order of generality
*/
asm.CodeBlock.prototype.genDeferred = function (checks, prods)
{
    this.extend(this.deferred(checks, prods));
    return this;     
};

/**
    <p>Add enough "fill" bytes to reach
    the next address at "offset" from "multiple".
    Formally, force alignment to the next address congruent
    to "offset" modulo "multiple". </p>

    <p>For example:</p>
    <pre>
    -multiple: 5
    -pos: 3
    -offset: 1
    -fill: 0

      | ---- Multiple ----| 
    +---+---+---+---+---+---+---+
    | x | x | x |   | y | y | y |
    +---+---+---+---+---+---+---+
                  ^           ^
                  |           |           
                  pos         offset

    Should give:

      | ---- Multiple ----|
    +---+---+---+---+---+---+---+---+
    | x | x | x | 0 | 0 | 0 | y | y |
    +---+---+---+---+---+---+---+---+
    </pre>

*/
asm.CodeBlock.prototype.align = function (multiple, offset, fill)
{
    var checks, prods;

    // Default values

    if (offset === undefined)
        offset = 0;

    if (fill === undefined)
        fill = 0;


    /** @ignore 
       Returns a positive reminder
       no matter the sign of the operands */
    function mod(dividend, divisor)
    {
        const r = dividend % divisor;
        return (r<0) ? divisor+r : r;
    };

    /** @ignore check function */
    function nb_bytes(cb, pos) { return mod((-pos + offset), multiple); };

    /** @ignore production function */
    function add_bytes(cb, pos)
    {
        for (var i=0; i < nb_bytes(cb, pos); ++i)
        {
           cb.gen8(fill); 
        }
    };
    checks = [nb_bytes];
    prods  = [add_bytes]; 

    return this.genDeferred(checks,prods);
};


/** Add enough zero bytes to the code block to align to
    to the given address */
asm.CodeBlock.prototype.origin = function (address, fill)
{
    if (!fill)       { fill = 0; };

    function nb_bytes(cb, pos) { return address - pos; };
    function add_bytes(cb, pos)
    {
        const len = nb_bytes(pos); 
        if (len < 0) 
        { 
            asm.error("address '" + address +
                      "' must be greater than position '" + pos + "'");
        }

        for (var i=0; i<len; ++i)
        {
            cb.gen8(fill);
        }
    };
    return this;
};

/**
   Assembles the code block.  After assembly, the
   label objects will be set to their final position and the
   alignment bytes and the deferred code will have been produced.  It
   is possible to extend the code block after assembly.  However, if
   any of the procedures {@link asm.CodeBlock#genLabel}, 
   {@link asm.CodeBlock#align}, and {@link asm.CodeBlock#genDeferred} 
   are called, the code block will have to be assembled once more  */
asm.CodeBlock.prototype.assemble = function ()
{
    var fixupList  = [];
    var span       = 0;
    var pos        = this.startPos;
    var hasChanged = true;
    var oldSize    = 0;
    var newSize    = 0;
    var oldCode    = this.code;
    var curr;
    var check;
    
    // Create the fixup list and generate an initial position
    // assignment for labels    
    for (var i=0, curr=this.code[i]; i<this.code.length; ++i, curr=this.code[i])
    {
        if (typeof curr === "number") { span++; pos++; continue; };

        switch(curr.type)
        {
            case asm.type.LBL:
                curr.setPos(pos);
                fixupList.push([span, curr]); 
                span = 0;
                break;
            case asm.type.DEF:
                fixupList.push([span, curr]);
                span = 0;
                break;
            default:
                break;
        }
    }

    // Fix-point to determine labels and deferred code size
    while(hasChanged)
    {
        hasChanged = false;

        // Determine size of deferred code given current label positions
        pos = this.startPos;
        for(var i=0; i<fixupList.length; ++i)
        { 
            span=fixupList[i][0];
            curr=fixupList[i][1];
            pos += span;

            if (curr.type !== asm.type.DEF) { continue; }

            oldSize = curr.size;
            newSize = null;
            // Try every check procedure until finding one that returns
            // a valid size
            while (curr.current < curr.length)
            {
                check   = curr.checks[curr.current];
                newSize = check(this, pos);

                if (newSize !== null)
                {
                    break;
                } else 
                { 
                    curr.current++;
                }
            }

            if (newSize === null) 
            { 
                asm.error("every check procedure tested without" +
                      " finding a valid one"); 
            }

            // Update deferred object
            if (oldSize !== newSize)
            {
                pos = pos + oldSize;
                curr.size = newSize;
                hasChanged = true;
            }
           
            // In every case, advance position according to old size 
            pos = pos + oldSize;
        }

        // Determine label positions given new size of deferred code
        pos = this.startPos;
        for(var i=0; i<fixupList.length; ++i)
        { 
            span=fixupList[i][0];
            curr=fixupList[i][1];
            pos += span;

            switch(curr.type)
            {
                case asm.type.LBL:
                    if (curr.getPos() !== pos) {curr.setPos(pos); hasChanged = true;};
                    break;
                case asm.type.DEF:
                    pos = pos + curr.size;
                    break; 
                default:
                    break;
            } 
        }
    }

    // Generate deferred code
    this.code = [];
    pos=this.startPos;
    for (var i=0, curr=oldCode[i]; i < oldCode.length; ++i, curr=oldCode[i])
    {
        if (typeof curr === "number") 
        { 
            this.extend(curr); 
            pos = pos + 1;
        }
        else 
        {

            switch(curr.type)
            {
                case asm.type.LBL:
                    if (curr.getPos() !== pos) 
                    {
                        asm.error("inconsistency detected");
                    };
                    break;
                case asm.type.DEF:
                    curr.prods[curr.current](this, pos);
                    pos = pos + curr.size;
                    break; 
                default:
                    // Leave other objects in place
                    this.extend(curr);
                    break;
            } 
        };
    }
    return pos;
};

/** Returns an allocated machine code block with the assembled
    code. This block must be freed using freeMachineBlock */
asm.CodeBlock.prototype.assembleToMachineCodeBlock = function ()
{
    const that = this;

    const len = this.assemble();
    const block = allocMemoryBlock(len, true);
    const baseAddr = asm.address(getBlockAddr(block));
    var pos = 0;

    for (var i=0; i<this.code.length; i++)
    {
        var x = this.code[i];
        if (typeof x === "number")
        {
            //block[pos++] = x;
            writeToMemoryBlock(block, pos++, x);
        }
    }

    // Create all the required objects
    block.requiredArray = this.requiredArray.map( 
        function (o) { 
            const offset = o.label.getPos() - that.startPos; 
            const dstAddr = baseAddr.addOffset(offset);

            return { getOffset: function () { return offset; },
                     linkValue: function () { return this.linkObj.linkValue(dstAddr); },
                     linkObj: o.linkObj};
        });

    block.getRequiredIt = function ()
    {
        return new ArrayIterator(this.requiredArray);
    };
                     
    // Initialize all the provided objects 
    this.providedArray.forEach( 
        function (o) { 
            const offset = o.label.getPos() - that.startPos; 
            const srcAddr = baseAddr.addOffset(offset);

            assert(srcAddr !== null, 'source address is null');
            
            o.linkObj.setAddr(srcAddr);

        });

    // Add a linking function for convenience
    block.link = function () { asm.link(this); };

    return block;
};

/** Returns the number of bytes in the code block */
asm.CodeBlock.prototype.byteNb = function ()
{
    var nb = 0;

    this.code.forEach(function (o) { if (typeof o === "number") { nb++; } });

    return nb;
};

/** 
    Marks the position at which the object is required for a subsequent
    linking with the same or different machine code block providing
    an object with the same value.  
    
    'linkObj' is the linking object that will be used to connect a 
    requiring site to a providing site during linking. It can be any 
    javascript object implementing the following methods:
    - 'linkValue(dstAddr)', returns an array of bytes totalling 'width' bits.
                            Called when the generated machine code block is linked.
    - 'width()', number of bits of the linkValue returned. Should be a multiple of 8.
                 Called when genRequired is called.
*/
asm.CodeBlock.prototype.genRequired = function (linkObj)
{

    // Add a label to retrieve the offset after assembly
    const label = this.label();        

    this.genLabel(label);
    // Adds temporary zeros to be replaced with the linked value
    this.genNumber(linkObj.width(), 0);

    // Maintain the required object list
    this.requiredArray.push({label:label, linkObj:linkObj});
};

/**
    Marks the position at which the object is provided for a subsequent
    linking.
    
    'linkObj' is the linking object that will be used to connect a 
    requiring site to a providing site during linking. It can be any 
    javascript object implementing the following methods:
    - 'setAddr(addr)' set to the address of the machine code block 
                      when the machine code block is assembled

*/
asm.CodeBlock.prototype.genProvided = function (linkObj)
{
    // Add a label to retrieve the offset after assembly
    const label = this.label();        
    this.genLabel(label);

    // Maintain the provided object list
    this.providedArray.push({label:label, linkObj:linkObj});
};

/** 
    Patches at each of the requiring site of the machine code block,
    the address of the corresponding providing site, as determined by
    the equality of the linking objects.

    'mcb' is the machine code block to link.
    
    mcb must implement the following methods:
    - 'getRequiredIt()' returns an iterator to the required objects

    Required objects must implement the following methods:
    - 'linkValue()', returns an array of bytes 
    - 'getOffset()', returns the offset in number of bytes from 
                     the beginning of the mcb
*/
asm.link = function (mcb)
{
    var bytes, offset;

    // For each requiring site of each machine code block,
    // find the address of the providing site associated to the linking
    // object and patch it at the requiring site
    for (var it = mcb.getRequiredIt(); it.valid(); it.next())
    {
        bytes  = it.get().linkValue();
        offset = it.get().getOffset();

        assert(bytes.length !== undefined, "Invalid link value, expected array of bytes");

        for (var i = 0; i < bytes.length ; ++i)
        {
            //mcb[offset + i] = bytes[i]; 
            writeToMemoryBlock(mcb, offset+i, bytes[i]);
        }
    }

};

/** Represents a machine address */
/* TODO: replace with "num" type */
asm.address = function (byteArray, bigEndian)
{
    if (bigEndian === undefined)
        bigEndian = false;

    const that = Object.create(asm.address.prototype);

    var i,k;
    
    assert(byteArray.length === 4 || byteArray.length === 8,
           "Address '" + byteArray + "' must be 4 or 8 bytes long");

    if (bigEndian === true)
    {
        byteArray = byteArray.slice(0).reverse();
    }

    that.addrElemArray = [];
    that.addrElemArray.length = byteArray.length >> 1;

    that.bigEndian = bigEndian;

    for (i=that.addrElemArray.length-1; i >= 0; --i)
    {
        k = i << 1;
        that.addrElemArray[i] = (byteArray[k+1] << 8) + byteArray[k];
    }

    return that;
};

/** Returns a null address */
asm.address.nullAddr = function (width, bigEndian)
{
    var byteArray = (width === 32) ? [0,0,0,0] : [0,0,0,0,0,0,0,0];
    return asm.address(byteArray, bigEndian);
};

/** Returns the number of bits in the address */
asm.address.prototype.width = function ()
{
    return this.addrElemArray.length === 2 ? 32 : 64;
};

/** Returns a copy of the current address */
asm.address.prototype.copy = function ()
{
    newAddr = Object.create(this);
    newAddr.addrElemArray = this.addrElemArray.slice(0);
    newAddr.bigEndian = this.bigEndian;
    return newAddr;
};

/** Returns a new address corresponding to the old address
    added to the integer value of the offset
*/
asm.address.prototype.addOffset = function (n)
{
    if (n < 0) 
    {
        return this.subOffset(-n);
    }

    const newAddr = this.copy();
    const length = newAddr.addrElemArray.length;

    var carry = 0;
    var opnd  = n;
    var i     = 0;
    var res   = 0;

    while (opnd > 0 || carry !== 0)
    {
        assert(i < length, "Address overflow");

        res   = this.addrElemArray[i] + (opnd & 0xFFFF) + carry;
        newAddr.addrElemArray[i] = res & 0xFFFF;

        carry = res >> 16;
        opnd  = opnd >> 16;
        i++;
    }
    return newAddr;
};

/** Returns a new address located at old address - n */
asm.address.prototype.subOffset = function (n)
{
    
    if (n < 0) 
    {
        return this.addOffset(-n);
    }

    const newAddr = this.copy();
    const length = newAddr.addrElemArray.length;

    var carry = 0;
    var opnd  = n;
    var i     = 0;
    var res   = 0;

    while (opnd > 0 || carry !== 0)
    {

        res   = this.addrElemArray[i] - (opnd & 0xFFFF) + carry;

        if (res >= 0)
        {
            newAddr.addrElemArray[i] = res;
            carry = 0;
        } else
        {
            newAddr.addrElemArray[i] = res + 0x10000;
            carry = -1;
        }

        opnd  = opnd >> 16;
        i++;
    }
    
    assert(opnd === 0 && carry === 0, "Address underflow");

    return newAddr;
};

/** Returns a new address corresponding to the sum of the
    value of the old address with the new modulo width.
*/
asm.address.prototype.addAddress = function (addr)
{
    assert(this.width() === addr.width(),
           "both addresses must have the same width");

    const newAddr = this.copy();
    const length = newAddr.addrElemArray.length;
    var carry = 0;
    var i     = 0;
    var res   = 0;

    for (i=0; i < length; ++i)
    {
        res   = this.addrElemArray[i] + addr.addrElemArray[i] + carry; 
        carry = res >> 16;
        newAddr.addrElemArray[i] = res & 0xFFFF;
    }

    return newAddr;
};

/** Returns the complement of the address */
asm.address.prototype.complement = function ()
{
    const newAddr = this.copy();
    const length = newAddr.addrElemArray.length;
    var i = 0;

    for (i=0; i < length; ++i)
    {
        newAddr.addrElemArray[i] = (0xFFFF - this.addrElemArray[i]);
    }

    return newAddr.addOffset(1);
};

/** Returns the offset needed to reach 'addr' from this.addr */
asm.address.prototype.getAddrOffsetBytes = function (addr, bigEndian)
{
    if (bigEndian === undefined)
    {
        bigEndian = this.bigEndian;
    }

    assert(this.width() === 32, "64 bits offsets are not supported");
    
    assert(this.width() === addr.width(),
           "both addresses must have the same width");

    return addr.addAddress(this.complement()).getBytes(bigEndian);
};

/** Compare two addresses. Returns -1 if this is lesser than 'addr',
    0 if they are equal, 1 if this is greater than 'addr'
*/
asm.address.prototype.cmp = function (addr)
{
    assert(this.width() === addr.width(),
           "both addresses must have the same width");

    var i;
    for (i=addr.addrElemArray.length-1; i>=0; --i)
    {
        if (this.addrElemArray[i] < addr.addrElemArray[i])
        {
            return -1;
        } else if(this.addrElemArray[i] > addr.addrElemArray[i])
        {
            return 1;
        }
    }
    return 0;
};

/** Returns an array of bytes containing the address */
asm.address.prototype.getBytes = function (bigEndian)
{
    if (bigEndian === undefined)
    {
        bigEndian = this.bigEndian;
    }

    a = [];
    a.length = this.addrElemArray.length << 1;
    var i,k;

    for (i=this.addrElemArray.length - 1; i >=0; --i)
    {
        k = i << 1;
        a[k]     = this.addrElemArray[i] & 0x00FF;
        a[k + 1] = (this.addrElemArray[i] >> 8) & 0xFF;
    }

    if (bigEndian === true)
    {
        return a.reverse();
    } else 
    {
        return a;
    }
};

/** Returns a string representation of an address */
asm.address.prototype.toString = function ()
{
    return this.getBytes().toString();
};
