function evals_true(v)
{
    if (v)
    {
    }
    else
    {
        return false;
    }

    if (!v)
    {
        return false;
    }

    return true;
}

function evals_false(v)
{
    if (v)
    {
        return false
    }

    if (!v)
    {
    }
    else
    {
        return false;
    }

    return true;
}

function test()
{
    if (evals_true(true) !== true)
        return 1;
    if (evals_false(false) !== true)
        return 2;

    if (evals_true(1) !== true)
        return 3;
    if (evals_true(-1) !== true)
        return 4;
    if (evals_false(0) !== true)
        return 5;

    if (evals_false(null) !== true)
        return 3;
    if (evals_false(undefined) !== true)
        return 3;








    return 0;
}

