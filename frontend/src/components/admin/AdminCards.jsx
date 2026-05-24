import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

export const MetricCard = ({ title, value, subtitle, color }) => (
  <Card className={`${color} border-white/20 shadow-lg`}>
    <CardHeader className="pb-2">
      <CardTitle className="text-sm font-semibold opacity-90">{title}</CardTitle>
    </CardHeader>
    <CardContent>
      <p className="text-3xl font-bold mb-1">{value}</p>
      <p className="text-sm opacity-75">{subtitle}</p>
    </CardContent>
  </Card>
);

export const TodayMetric = ({ label, value }) => (
  <div className="text-center">
    <div className="text-2xl font-bold text-white">{value}</div>
    <div className="text-sm text-gray-300">{label}</div>
  </div>
);

export const AccountingCard = ({ title, value, subtitle, bgColor }) => (
  <Card className={`${bgColor} border-white/20`}>
    <CardHeader className="pb-2">
      <CardTitle className="text-sm font-semibold opacity-90">{title}</CardTitle>
    </CardHeader>
    <CardContent>
      <p className="text-2xl font-bold mb-1">{value}</p>
      <p className="text-xs opacity-75">{subtitle}</p>
    </CardContent>
  </Card>
);

export const StatsCard = ({ title, stats }) => (
  <Card className="bg-white/10 backdrop-blur-lg border-white/20">
    <CardHeader>
      <CardTitle className="text-xl font-bold">{title}</CardTitle>
    </CardHeader>
    <CardContent>
      <div className="space-y-3">
        {stats.map((stat, index) => (
          <div key={index} className="flex justify-between items-center">
            <span className="text-gray-300">{stat.label}</span>
            <span className="font-semibold text-lg">{stat.value}</span>
          </div>
        ))}
      </div>
    </CardContent>
  </Card>
);
