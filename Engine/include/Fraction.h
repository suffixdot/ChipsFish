#pragma once
#include <string>
#include <iostream>

class Fraction {
private:
    long long num;
    long long den;

    void reduce();

public:
    Fraction();
    Fraction(long long n);
    Fraction(long long n, long long d);

    long long numerator() const { return num; }
    long long denominator() const { return den; }

    Fraction operator+(const Fraction& other) const;
    Fraction operator-(const Fraction& other) const;
    Fraction operator-() const;
    Fraction operator*(const Fraction& other) const;
    Fraction operator/(const Fraction& other) const;

    bool operator==(const Fraction& other) const;
    bool operator!=(const Fraction& other) const;
    bool operator<(const Fraction& other) const;
    bool operator>(const Fraction& other) const;
    bool operator<=(const Fraction& other) const;
    bool operator>=(const Fraction& other) const;

    std::string to_string() const;

    static Fraction parse(const std::string& s);
};

std::ostream& operator<<(std::ostream& os, const Fraction& f);