// ============================================================================
// 示例像素着色器模板 - 逆水寒手游 (nshm.exe)
// ----------------------------------------------------------------------------
// 使用方法：
//   1. 按 F4 开启猎取（Hunting）模式
//   2. 用小键盘 1/2 浏览像素着色器，选中目标后按小键盘 3 标记
//      —— 3DMigoto 会把反编译后的 .txt 导出到 ShaderFixes 目录，
//         并将着色器 hash 复制到剪贴板
//   3. 编辑导出的 .txt（本文件不参与替换，仅供 HAL 引用示例）
//   4. 在 d3dx.ini 的 [ShaderOverride-XXX] 中填入 hash，并引用本文件：
//         [ShaderOverride-XXX]
//         hash = <剪贴板中的 hash>
//         handling = skip
//         draw = from_caller
//         run = CustomShaderExample
//      以及：
//         [CustomShaderExample]
//         draw = from_caller
//         ps-t0 = ShaderFixes/example.hlsl
//   5. 按 F10 重载配置（若开了 cache_shaders，请先删除 ShaderCache 目录）
//
// StereoParams / IniParams 说明：
//   - t125 = StereoParams, t120 = IniParams（见 d3dx.ini [Rendering]）
//   - 在 HLSL 中声明对应寄存器即可读取全局参数
// ============================================================================

Texture2D<float4> StereoParams : register(t125);
Texture2D<float4> IniParams : register(t120);

#define load(x, y) StereoParams.Load(3 * int2(x, y))
#define i(x, y) IniParams.Load(3 * int2(x, y))

// 从游戏着色器导出的 .txt 中，把主函数体粘贴到下面的 HLSL 里修改，
// 保持输入/输出签名与原始着色器一致（导出文件的头部注释中列有签名）。

struct vs_out {
    float4 pos : SV_Position;
    float2 uv : TEXCOORD0;
    float4 color : COLOR0;
};

float4 main(vs_out i0) : SV_Target
{
    float4 result = i0.color;

    // 示例：简单的灰度化效果
    // float g = dot(result.rgb, float3(0.299, 0.587, 0.114));
    // result.rgb = g.xxx;

    return result;
}
