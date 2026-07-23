#include "Fraction.h"
#include <numeric>
#include <cmath>
#include <stdexcept>

void Fraction::reduce() {
    if (den == 0) {
        throw std::invalid_argument("Denominator cannot be zero");
    }
    long long g = std::gcd(std::abs(num), std::abs(den));
    num /= g;
    den /= g;
    if (den < 0) {
        num = -num;
        den = -den;
    }
}

Fraction::Fraction() : num(0), den(1) {}

Fraction::Fraction(long long n) : num(n), den(1) {}

Fraction::Fraction(long long n, long long d) : num(n), den(d) {
    reduce();
}

Fraction Fraction::operator+(const Fraction& other) const {
    return Fraction(num * other.den + other.num * den, den * other.den);
}

Fraction Fraction::operator-(const Fraction& other) const {
    return Fraction(num * other.den - other.num * den, den * other.den);
}

Fraction Fraction::operator-() const {
    return Fraction(-num, den);
}

Fraction Fraction::operator*(const Fraction& other) const {
    return Fraction(num * other.num, den * other.den);
}

Fraction Fraction::operator/(const Fraction& other) const {
    return Fraction(num * other.den, den * other.num);
}

bool Fraction::operator==(const Fraction& other) const {
    return num == other.num && den == other.den;
}

bool Fraction::operator!=(const Fraction& other) const {
    return !(*this == other);
}

bool Fraction::operator<(const Fraction& other) const {
    // A/B < C/D  =>  A*D < C*B (since denominators B and D are positive)
    return num * other.den < other.num * den;
}

bool Fraction::operator>(const Fraction& other) const {
    return other < *this;
}

bool Fraction::operator<=(const Fraction& other) const {
    return !(*this > other);
}

bool Fraction::operator>=(const Fraction& other) const {
    return !(*this < other);
}

std::string Fraction::to_string() const {
    if (den == 1) return std::to_string(num);
    return std::to_string(num) + "/" + std::to_string(den);
}

Fraction Fraction::parse(const std::string& s) {
    size_t slash = s.find('/');
    if (slash == std::string::npos) {
        return Fraction(std::stoll(s));
    } else {
        long long n = std::stoll(s.substr(0, slash));
        long long d = std::stoll(s.substr(slash + 1));
        return Fraction(n, d);
    }
}

std::ostream& operator<<(std::ostream& os, const Fraction& f) {
    os << f.to_string();
    return os;
}