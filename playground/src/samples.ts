export interface Sample {
  name: string;
  lang: 'php' | 'js';
  originalTitle: string;
  modifiedTitle: string;
  original: string;
  modified: string;
}

const phpOriginal = `<?php

declare(strict_types=1);

namespace App\\Service;

use App\\Entity\\Order;
use App\\Repository\\OrderRepository;
use Psr\\Log\\LoggerInterface;

/**
 * Calculates order totals.
 */
final class OrderCalculator
{
    private const TAX_RATE = 0.1;

    public function __construct(
        private OrderRepository $orders,
        private LoggerInterface $logger,
    ) {
    }

    public function total(int $orderId): float
    {
        $order = $this->orders->find($orderId);
        if ($order === null) {
            throw new \\RuntimeException("Order $orderId not found");
        }

        $sum = 0;
        foreach ($order->getItems() as $item) {
            $sum += $item->getPrice() * $item->getQuantity();
        }

        return $sum + $sum * self::TAX_RATE;
    }

    public function discount(Order $order, float $percent): float
    {
        return $this->total($order->getId()) * (1 - $percent / 100);
    }

    private function log(string $message): void
    {
        $this->logger->info($message);
    }

    public function isEmpty(Order $order): bool
    {
        return count($order->getItems()) === 0;
    }

    public function itemCount(Order $order): int
    {
        $count = 0;
        foreach ($order->getItems() as $item) {
            $count += $item->getQuantity();
        }
        return $count;
    }
}
`;

const phpModified = `<?php

declare(strict_types=1);

namespace App\\Service;

use App\\Entity\\Order;
use App\\Entity\\OrderItem;
use App\\Repository\\OrderRepository;
use Psr\\Log\\LoggerInterface;

/**
 * Calculates order totals, including tax.
 */
final class OrderCalculator
{
    private const TAX_RATE = 0.11;

    public function __construct(
        private readonly OrderRepository $orders,
        private readonly LoggerInterface $logger,
    ) {
    }

    public function total(int $orderId): float
    {
        $order = $this->orders->find($orderId)
            ?? throw new \\RuntimeException("Order #$orderId not found");

        $sum = array_sum(array_map(
            static fn (OrderItem $item): float => $item->getPrice() * $item->getQuantity(),
            $order->getItems(),
        ));

        $this->log("Total for order $orderId: $sum");

        return $sum + $sum * self::TAX_RATE;
    }

    public function discount(Order $order, float $percent): float
    {
        return $this->total($order->getId()) * (1 - $percent / 100);
    }

    public function isEmpty(Order $order): bool
    {
        return count($order->getItems()) === 0;
    }

    public function itemCount(Order $order): int
    {
        $count = 0;
        foreach ($order->getItems() as $item) {
            $count += $item->getQuantity();
        }
        return $count;
    }
}
`;

const jsOriginal = `import { readFile } from 'node:fs/promises';

export async function loadConfig(path) {
  const raw = await readFile(path, 'utf8');
  const config = JSON.parse(raw);
  if (!config.name) {
    throw new Error('Missing name');
  }
  return config;
}

export function merge(a, b) {
  return Object.assign({}, a, b);
}
`;

const jsModified = `import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export async function loadConfig(path, defaults = {}) {
  const raw = await readFile(resolve(path), 'utf8');
  const config = { ...defaults, ...JSON.parse(raw) };
  if (!config.name) {
    throw new TypeError(\`Missing "name" in \${path}\`);
  }
  return config;
}

export const merge = (a, b) => ({ ...a, ...b });
`;

export const samples: Sample[] = [
  { name: 'PHP – OrderCalculator', lang: 'php', originalTitle: 'OrderCalculator.php (HEAD)', modifiedTitle: 'OrderCalculator.php (Your version)', original: phpOriginal, modified: phpModified },
  { name: 'JS – config.js', lang: 'js', originalTitle: 'config.js (HEAD)', modifiedTitle: 'config.js', original: jsOriginal, modified: jsModified },
  { name: 'Identical', lang: 'js', originalTitle: 'a.js', modifiedTitle: 'b.js', original: jsOriginal, modified: jsOriginal },
];
