using Miningcore.Contracts;
using Miningcore.Native;

namespace Miningcore.Crypto.Hashing.Algorithms;

[Identifier("yespower-korsh")]
public unsafe class YespowerKorsh : IHashAlgorithm
{
    // Korsh (KSH) PoW: YesPower 1.0, N=256, r=8, no personalization.
    public void Digest(ReadOnlySpan<byte> data, Span<byte> result, params object[] extra)
    {
        Contract.Requires<ArgumentException>(result.Length >= 32);

        fixed (byte* input = data)
        {
            fixed (byte* output = result)
            {
                Multihash.yespowerKorsh(input, output, (uint) data.Length);
            }
        }
    }
}
