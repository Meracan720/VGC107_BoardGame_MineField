<!--
Author: Gary (JiaxingChen)
Project: VGC107 - Board Game Term Project
Evaluation Date: 2026-09-21
Version Name: v0.3.1
-->

# Game Evaluation - v0.3.1

评估日期：2026-09-21

## 结论

当前版本的核心游戏逻辑、执行推进和胜利判定未发现确定性 bug。队列推进、淘汰跳过、单步与批量执行、最后存活者胜利、炸弹清空胜利和高 HP 平局均通过验证。

本次检查发现并修正了一处规则说明错误：攻击成功推挤玩家时实际会造成 1 HP 伤害，但原先的游戏说明仍写着玩家阻挡不会造成伤害。说明已同步更新到 `game.js` 和 `game.html`。

主要剩余风险集中在地图连通性和 AI 长局，而不是胜利状态机本身。

## 自动化验证

- 全量 Node 测试：127 passed，0 failed。
- 攻击与规则专项测试：22 passed，0 failed。
- 静态诊断：`game.js`、`game-rules.js`、`bots.js`、`game-agents.js` 均无错误。
- 单步执行与批量执行结果一致。
- 检查了淘汰后的队列跳过、扫描移动暂停、攻击推挤、地雷伤害、Sudden Death 和胜利提前终止。
- 检查了玩家存活状态与 HP、地图边界、地形占位和玩家重叠状态。

## AI 回归测试

使用 `node tests/audit-simulation.js 20 60 audit-check.json` 运行每个 AI 难度 20 局，每局最多 60 回合。所有测试均为四名同难度 AI 对战，不代表人类玩家胜率。

| AI 难度 | 对局数 | 60 回合内结束 | 达到上限 | Agent failures |
| --- | ---: | ---: | ---: | ---: |
| New Player | 20 | 6 | 14 | 0 |
| Moderate | 20 | 20 | 0 | 0 |
| Expert | 20 | 18 | 2 | 0 |

AI 审计期间没有发现非法状态、玩家重叠、越界、非法地形占位、HP/alive 不一致或 agent failure。

### AI 长局风险

New Player 的结束率偏低，部分对局在 60 回合时仍有多名玩家存活。Expert 也有少量长局，最长连续无伤害阶段达到 25 回合。当前这更像是策略和平衡问题，不是执行卡死。

建议后续考虑：

1. 为 New Player 增加更明确的脱困和接近敌人的策略。
2. 评估 Disarm 的成本、范围或使用频率，避免防守循环过强。
3. 考虑增加回合上限或额外的后期压力规则。
4. 用人类实际对局再验证攻击、Disarm 和扫描的平衡。

## 地图审计

使用 `node tests/audit-maps.js 1000`，分别检查 Walls、Ridges 和 Random Mix，每种 1000 张地图。

- 墙体和脊线数量符合配置。
- 起始格保持安全。
- Walls 配置没有发现区域断开。
- Ridges 和 Random Mix 各发现 6/1000 张地图存在区域分隔。
- Walls 配置出现 29 个完全被阻挡的起始座位样本。
- Random Mix 配置出现 107 个完全被阻挡的起始座位样本。

这些结果不表示胜利判定错误，但永久脊线可能把玩家分隔到无法互相攻击的区域，从而造成低互动或长局。建议后续让脊线生成器在完成后检查所有起始位置的连通性，并单独评估起始格的逃生路线。

## 已确认的规则行为

- 普通移动撞到玩家时，会随机挤到附近合法格。
- 如果移动者本轮计划中包含 Attack，撞到玩家时会造成 1 HP 伤害，并尝试沿移动方向推开阻挡者。
- 攻击成功推挤玩家时造成 1 HP 伤害。
- 攻击推挤撞到墙、脊、边界或其他玩家时，仍按照当前规则处理伤害和阻挡。
- 淘汰玩家的后续动作会被跳过，执行不会停滞。
- 最后一名存活玩家优先触发 Last Survivor 胜利。
- 多名存活玩家清空所有炸弹时，按最高 HP 判定胜利，平局共享胜利。

## 复现命令

```powershell
node --test (Get-ChildItem tests -Filter *.test.js | ForEach-Object { $_.FullName })
node tests/audit-probes.js
node tests/audit-maps.js 1000
node tests/audit-simulation.js 20 60 audit-check.json
```

AI 审计结果写入 `tests/audit-check.json`。本报告对应版本名：**v0.3.1**。
